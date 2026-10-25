targetScope = 'resourceGroup'

@description('azd environment name — also used as the Container App name.')
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('LLM provider inside the container: llama_cpp (offline, baked GGUF) or openai (hosted API).')
@allowed([
  'llama_cpp'
  'openai'
  'ollama'
])
param llmProvider string = 'llama_cpp'

@description('Endpoint when llmProvider is openai/ollama. Leave empty for llama_cpp.')
param llmEndpoint string = ''

@secure()
@description('API key when llmProvider is openai (Groq, OpenRouter, OpenAI, ...). Ignored otherwise.')
param llmApiKey string = ''

var resourceToken = toLower(uniqueString(resourceGroup().id, environmentName))
var tags = {
  'azd-env-name': environmentName
}
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

// Free-tier guardrails: minimum 30-day retention and a ~5 GB/month ingest cap
// (0.167 GB/day) keep the Log Analytics workspace inside its free allowance.
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${resourceToken}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      // json() wrapper: Bicep < 0.49 (incl. the one azd bundles) has no float
      // literals and lexes 0.167 as int 0 + property access.
      dailyQuotaGb: json('0.167')
    }
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${resourceToken}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${resourceToken}acr'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
}

// The Container App pulls from ACR with its own managed identity — no admin
// credential is stored anywhere.
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: '${resourceToken}-identity'
  location: location
  tags: tags
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, appIdentity.id, 'AcrPull')
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleId
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: environmentName
  location: location
  tags: union(tags, {
    'azd-service-name': 'web'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      // Container Apps rejects empty-valued secrets, so when no API key is
      // configured (llama_cpp needs none) a placeholder is stored instead;
      // llama_cpp never reads it, and openai deploys overwrite it.
      secrets: [
        {
          name: 'llm-api-key'
          value: empty(llmApiKey) ? 'unset' : llmApiKey
        }
      ]
      registries: [
        {
          server: registry.properties.loginServer
          identity: appIdentity.id
        }
      ]
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'echoread'
          // Placeholder: `azd deploy` replaces this with the pushed image.
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('2.0')
            memory: '4Gi'
          }
          env: [
            {
              name: 'ECHOREAD_PROFILE'
              value: 'cpu'
            }
            {
              name: 'ECHOREAD_LLM_PROVIDER'
              value: llmProvider
            }
            {
              name: 'ECHOREAD_LLM_ENDPOINT'
              value: empty(llmEndpoint) ? '' : llmEndpoint
            }
            {
              name: 'ECHOREAD_LLM_API_KEY'
              secretRef: 'llm-api-key'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 8000
              }
              periodSeconds: 5
              failureThreshold: 60
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8000
              }
              periodSeconds: 10
              failureThreshold: 6
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8000
              }
              initialDelaySeconds: 60
              periodSeconds: 30
              failureThreshold: 5
            }
          ]
        }
      ]
      // Scale to zero: idle cost is exactly $0 and the free consumption grant
      // covers ~25h of 2vCPU/4Gi runtime per month. One replica max — plenty
      // for a demo, and it protects the grant from accidental scale-out.
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '8'
              }
            }
          }
        ]
      }
    }
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.properties.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.name
output APP_URL string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
