# Technical Evaluation & Model Registry: Melo

This document records the architectural evaluation, benchmark data, and integration roadmaps for speech models, turn-taking engines, and voice-synthesis libraries evaluated for **Melo**.

---

## 1. Evaluation Framework

Candidate models and APIs are evaluated across four criteria:

1. **Latency Budget (Time-to-First-Audio / TTFA):** Can the model deliver or process streaming audio within the `< 1,200ms` total pipeline budget?
2. **Cognitive UX & Sound Design:** Does the voice architecture avoid listener disorientation (e.g., maintaining a clear distinction between book narration and AI companion)?
3. **Execution & Demo Reliability:** Can the component run deterministically during live investor/hackathon demos without cold-start failures or WebRTC disconnects?
4. **Hardware & Operational Footprint:** Does the tool require dedicated GPU infrastructure (CUDA/Triton), or can it be consumed via managed streaming endpoints / edge runtimes?

---

## 2. Model Deep Dives

### 2.1 NineNineSix: Tyger (`nineninesix/tyger`)

* **Repository:** [nineninesix/tyger on Hugging Face](https://huggingface.co/nineninesix/tyger) | [tyger-s2s on GitHub](https://github.com/nineninesix-ai/tyger-s2s)
* **Category:** Streaming ASR + Full-Duplex Neural Turn-Taking (~652M parameters)
* **Core Architecture:** Frozen NVIDIA Nemotron 3.5 Streaming ASR (0.6B) encoder + causal GRU (14M) decision head. Evaluates dual audio streams (user mic + reference playback) every 80ms without lookahead.

#### Decision Outputs
* `Answer`: User finished speaking -> trigger LLM.
* `Stop`: User interrupted mid-sentence (barge-in) -> stop playback/TTS immediately.
* `Chime-in`: User issued backchannel ("uh-huh", "yeah") -> continue listening without yielding turn.

#### Evaluation for EchoRead
| Advantage | Risk / Blocker |
| :--- | :--- |
| True duplex barge-in without hardware buttons. | Requires self-hosted NVIDIA GPU server + dual-channel WebRTC streaming. |
| Ingests reference audio channel to cancel out self-echo. | Trained on conversational bot speech; untested on dynamic audiobook narration with music/effects. |
| Combines ASR and VAD into one 80ms step. | Excessive DevOps risk for a 1-week MVP demo. |

* **Verdict:** **Deferred to Post-MVP (Phase 2).** Use as a primary technical differentiator in the investor roadmap for ambient hands-free listening.

---

### 2.2 MyShell: OpenVoice (`myshell-ai/OpenVoice`)

* **Repository:** [myshell-ai/OpenVoice on GitHub](https://github.com/myshell-ai/OpenVoice)
* **Category:** Instant Zero-Shot Voice Cloning & Tone Color Transfer
* **Core Architecture:** Two-stage pipeline: Base TTS (MeloTTS or external synthesizer) $\rightarrow$ Tone Color Converter neural network driven by a reference speaker embedding (1–5s audio clip).

#### Evaluation for EchoRead
| Advantage | Risk / Blocker |
| :--- | :--- |
| Can clone any voice with 2 seconds of clean audio. | Two-stage pipeline introduces serialization delay (`TTFA > 1,200ms`). |
| Flexible emotional and accent styling. | Cloning the book narrator violates cognitive separation principles. |
| Useful for offline batch narration of EPUB/PDFs. | Not designed for token-by-token sentence streaming out-of-the-box. |

* **Verdict:** **Do Not Use for Real-Time Q&A.** Reserve strictly for offline batch generation (e.g., converting uploaded PDFs into audiobooks in a custom voice during Phase 2).

---

### 2.3 Other Noteworthy NineNineSix Models

* **Gepard (`nineninesix/gepard-1.1`):** Autoregressive streaming TTS with voice cloning. Natural prosody, but high GPU compute requirements compared to cloud streaming endpoints.
* **Kani-TTS (`nineninesix/kani-tts-2-en`):** Open-source conversational TTS framework. Good candidate for self-hosted companion voices in private/on-prem deployments.
* **Diamond (`nineninesix/diamond-1.0`):** Audio restoration and noise-cleaning model. Evaluated for preprocessing legacy or low-bitrate audiobook rips prior to forced alignment.

---

### 2.4 Google: EmbeddingGemma-2 (`google/embeddinggemma-2`)

* **Repository:** [google/embeddinggemma-2 on Hugging Face](https://huggingface.co/google/embeddinggemma-2)
* **Category:** Multimodal Embedding & Semantic Retrieval (~270M text backbone / 740M multimodal)
* **Core Architecture:** Dual/multimodal encoder projecting text and audio into a shared **768-dimensional vector space** with 8K context window. Supports Matryoshka Representation Learning (MRL) for dynamic dimension truncation (e.g. 768d $\rightarrow$ 256d).

#### Evaluation for EchoRead
| Advantage | Risk / Blocker |
| :--- | :--- |
| Shared audio + text latent space: directly bridges spoken audio and transcripts. | Slightly larger memory footprint than 22M MiniLM, but easily fits in ~300–750MB. |
| MRL allows truncating to 256d for sub-millisecond cosine similarity ranking. | Requires PyTorch or ONNX runtime in FastAPI backend. |
| Matches the native `VECTOR(768)` schema in PRD with zero dimensional mismatch. | None for desktop MVP. |

* **Verdict:** **Accepted for Temporal RAG Embedding Layer.** Runs locally on CPU/MX550 with state-of-the-art semantic precision.

---

## 3. The Active MVP Production Stack

For the [prd-mvp.md](file:///home/sanjeev/Downloads/echoread/prd-mvp.md) hackathon/investor demo, the pipeline prioritizes managed sub-second APIs and deterministic push-to-talk triggers:

```
[User Spacebar Hold] ──► [Groq Whisper-Turbo / Deepgram] ──► Text Query (~180ms)
                                                                 │
[SQLite / In-Memory] ◄── [Temporal Filter: end_ms <= current] ◄──┘
         │
         ▼ Retrieved Context (~30ms)
[Groq Llama-3.3-70B / Gemini 2.5 Flash] ──► Streaming Sentence 1 (~200ms)
                                                    │
                                                    ▼
[Cartesia Sonic / ElevenLabs Flash TTS] ──► Audio Chunk to Web Audio (~250ms)
```

### Component Comparison Table

| Pipeline Layer | MVP Selection | Latency (TTFB/TTFA) | Post-MVP / Production Alternative |
| :--- | :--- | :--- | :--- |
| **Turn Control** | **Push-to-Talk (`[Spacebar]`)** | ~0ms | `nineninesix/tyger` (80ms duplex stream) |
| **Speech-to-Text** | **Groq Whisper-Turbo / Deepgram** | ~180–200ms | WhisperX or self-hosted FastConformer |
| **Temporal RAG** | **EmbeddingGemma-2 (768d/256d MRL) + SQLite** | ~10–20ms | Supabase `pgvector` with partition-by-book |
| **Reasoning LLM**| **Groq Llama-3.3-70B / Gemini Flash**| ~200ms | Fine-tuned 8B Closed-World model |
| **Companion TTS**| **Cartesia Sonic / ElevenLabs Flash**| ~200–280ms | Kokoro-82M (Edge) or OpenVoice (Offline EPUB) |

---

## 4. Architecture Decision Records (ADRs)

### ADR 001: Push-to-Talk vs. Neural Turn-Taking for MVP
* **Status:** Accepted
* **Context:** Hackathon presentations occur in noisy environments with high background speech. Continuous VAD or wake words frequently trigger false interruptions.
* **Decision:** Use `[Spacebar]` Push-to-Talk and a prominent UI mic button for the MVP.
* **Consequence:** Eliminates audio feedback loops and mic misfires. Hands-free duplexing (via `nineninesix/tyger`) is documented as the Series Seed product milestone.

### ADR 002: Distinct Companion Voice vs. Narrator Voice Cloning
* **Status:** Accepted
* **Context:** OpenVoice allows cloning the narrator’s voice so the AI sounds identical to the audiobook reader.
* **Decision:** Reject narrator voice cloning for the companion agent. Enforce a distinct acoustic profile (e.g., warm studio conversational voice preceded by a 150ms earcon chime).
* **Consequence:** Prevents cognitive blur between the fiction narrative and factual meta-explanations.

### ADR 003: Pre-Indexed Audio Assets vs. Live Heavy Transcriptions
* **Status:** Accepted
* **Context:** Transcribing a 1-hour audiobook via cloud Whisper takes 30–60 seconds, which will kill stage momentum during a 2-minute pitch.
* **Decision:** Bundle two pre-aligned flagship assets (*The Mysterious Affair at Styles* and *Attention Is All You Need*) with pre-computed word-level timestamp JSONs. Allow custom uploads limited to 3 minutes.
* **Consequence:** Demo starts instantly in 1 click with 100% reliability.
