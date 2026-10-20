import type {
  BookManifest,
  BookSummary,
  ContextPreview,
  HealthResponse,
  IngestJobStatus,
  LoreEntry,
  Mode,
  QueryRequest,
  QueryResponse,
  TTSRequest,
  VoiceEvent,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        detail?: unknown;
        message?: unknown;
        error?: unknown;
      };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail
          .map((item: unknown) =>
            typeof item === "object" && item !== null && "msg" in item
              ? String((item as { msg: unknown }).msg)
              : String(item),
          )
          .join("; ");
      } else if (typeof body.message === "string") {
        message = body.message;
      } else if (typeof body.error === "string") {
        message = body.error;
      } else if (body.detail && typeof body.detail === "object") {
        message = JSON.stringify(body.detail);
      }
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", { signal });
}

export function fetchBooks(signal?: AbortSignal): Promise<BookSummary[]> {
  return request<BookSummary[]>("/api/books", { signal });
}

export function fetchBook(bookId: string, signal?: AbortSignal): Promise<BookManifest> {
  return request<BookManifest>(`/api/books/${encodeURIComponent(bookId)}`, { signal });
}

export function fetchContext(
  bookId: string,
  tMs: number,
  mode: Mode,
  query?: string,
  signal?: AbortSignal,
): Promise<ContextPreview> {
  const params = new URLSearchParams({ t_ms: String(tMs), mode });
  if (query) {
    params.set("query", query);
  }
  return request<ContextPreview>(
    `/api/books/${encodeURIComponent(bookId)}/context?${params.toString()}`,
    { signal },
  );
}

export function postQuery(payload: QueryRequest, signal?: AbortSignal): Promise<QueryResponse> {
  return request<QueryResponse>("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function postTTS(payload: TTSRequest, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    throw new ApiError(`TTS failed (${response.status})`, response.status);
  }
  return response.blob();
}

export function getJobStatus(jobId: string, signal?: AbortSignal): Promise<IngestJobStatus> {
  return request<IngestJobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export async function uploadBook(
  form: FormData,
  signal?: AbortSignal,
  onProgress?: (job: IngestJobStatus) => void,
): Promise<BookManifest> {
  const result = await request<BookManifest | IngestJobStatus>("/api/upload", {
    method: "POST",
    body: form,
    signal,
  });
  if ("chunks" in result && "words" in result) {
    return result as BookManifest;
  }
  const initialJob = result as IngestJobStatus;
  onProgress?.(initialJob);
  const jobId = initialJob.id;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const current = await getJobStatus(jobId, signal);
    onProgress?.(current);
    if (current.status === "completed" && current.manifest) {
      return current.manifest;
    }
    if (current.status === "failed") {
      throw new ApiError(current.error || "Ingestion failed", 500);
    }
  }
}

export async function readNdjson<T>(
  response: Response,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new ApiError("Streaming response has no body", response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          onEvent(JSON.parse(trimmed) as T);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      onEvent(JSON.parse(buffer.trim()) as T);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamVoiceQuery(
  form: FormData,
  onEvent: (event: VoiceEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/voice-query", {
    method: "POST",
    body: form,
    signal,
  });
  if (!response.ok) {
    let message = `Voice query failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch {
      // Keep the status-based message.
    }
    throw new ApiError(message, response.status);
  }
  await readNdjson<VoiceEvent>(response, onEvent, signal);
}

export function fetchLoreEntries(bookId: string, signal?: AbortSignal): Promise<LoreEntry[]> {
  return request<LoreEntry[]>(`/api/books/${encodeURIComponent(bookId)}/lore`, { signal });
}

export async function deleteLoreEntry(bookId: string, entryId: number): Promise<void> {
  await request<void>(`/api/books/${encodeURIComponent(bookId)}/lore/${entryId}`, {
    method: "DELETE",
  });
}

export async function clearLoreEntries(bookId: string): Promise<void> {
  await request<void>(`/api/books/${encodeURIComponent(bookId)}/lore`, {
    method: "DELETE",
  });
}
