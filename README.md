# EchoRead

EchoRead is a local-first audiobook companion that answers questions from the listener's current position without revealing later events. It combines a React player, a FastAPI backend, local speech-to-text, local retrieval, an open-weight LLM, and local text-to-speech.

STT, embeddings, retrieval, and TTS always run on your machine. The LLM runs fully offline via llama.cpp by default, or against any open-weight model you serve yourself (e.g. Gemma 4 via your own Ollama instance). No third-party hosted APIs are called.

## Status

This repository contains a working v0.1 MVP:

- Story mode with a hard spoiler horizon and grounded, refusal-first answers.
- Study mode that may add clearly labelled background knowledge.
- Synchronized, clickable transcript with Story redaction.
- Hold-to-talk voice questions and a typed-query fallback.
- Local audio (MP3, WebM, M4A, M4B) and document (EPUB, PDF, TXT) upload and ingestion.
- Local benchmark and spoiler-evaluation scripts.

See [BENCHMARKS.md](local-docs/BENCHMARKS.md) for measured latency against the CPU acceptance gate, and [EVALS.md](local-docs/EVALS.md) for the spoiler evaluation (20/20).

## Voice latency

The CPU profile targets p50 <= 3000 ms and p95 <= 4000 ms for time-to-first-audio. Three configurations have been measured (see [BENCHMARKS.md](local-docs/BENCHMARKS.md) for full data):

- **Local llama.cpp (Qwen2.5-1.5B, 2026-10-20):** p50 1895 ms / p95 2549 ms on the standard benchmark (PASS), but novel questions degrade to p50 5554 ms because CPU prompt prefill cannot reuse the KV cache.
- **Remote open-weight LLM (Gemma 4 4.6B Q4_K_M via Ollama, 2026-10-24):** first token drops to ~300-500 ms regardless of question novelty, giving a consistent TTFA of ~2.8-3.8 s; local STT and TTS now dominate the budget.
- **Phonon-2.5 STT (2026-10-24, same day):** switching STT to Phonon-2.5 cut in-path STT from ~1480 ms to ~633 ms — TTFA p50 1970 ms / p95 2047 ms, passing the CPU gate with margin.

The `tts_first_sentence_ms` timing field measures the first TTS chunk, not a full sentence.

To reduce time-to-first-audio, EchoRead:

- streams the first TTS chunk from the first complete clause or a short word-capped prefix, extended past dangling function words;
- removes spoken-only openers such as "The main idea so far is that" while keeping the displayed answer unchanged;
- uses `beam_size=1` and skips word timestamps for voice STT;
- plays Kokoro audio at speed `1.15`.

Tradeoffs: the first chunk can start mid-sentence, `beam_size=1` may modestly reduce transcription accuracy, and faster playback changes pacing.


## What it does

### Story mode

Story mode answers only from:

- the last 90 seconds of transcript immediately before the playhead (45 seconds on the CPU profile, to keep local prompts small);
- earlier chunks that end at or before the playhead.

Future chunks are never inserted into the prompt. Retrieved chunks that substantially overlap the immediate buffer are clipped to the parts outside it, so unique earlier evidence survives without repeating buffer text. If no evidence is retrieved and the question is not anchored in the immediate transcript, EchoRead refuses before calling the LLM. LLM refusal variants are canonicalized to one exact sentence.

### Study mode

Study mode retrieves from the whole supplied document and may add general background knowledge, prefixed with `Beyond the document:`.

## Requirements

- Python 3.11 or 3.12, managed with `uv`
- Node.js 22 and npm
- `ffmpeg`
- About 4 GB of free disk space for models and demo audio
- A working microphone for voice input

## Quick start

```bash
make setup       # uv sync + npm install
make models      # download the CPU model manifest
make assets      # build and ingest the demo books
make dev         # run FastAPI on :8000 and Vite on :5173
```

Open <http://127.0.0.1:5173>.

To check the installation without starting the dev server:

```bash
make preflight
```

The health endpoint is <http://127.0.0.1:8000/api/health>.

## Using the app

- Select `The Mysterious Affair at Styles` or `Attention Is All You Need` in the header.
- Press play. The transcript follows the playhead and dims later Story content.
- Hold `Space` or the microphone button to ask a question. Release to send.
- Use the keyboard icon in the voice dock for typed questions.
- Use `Add content` to upload audio (MP3, WebM, M4A, M4B) or documents (EPUB, PDF, TXT) up to 50 MB and 30 minutes.
- The `Latency` toggle shows per-stage timings in the voice dock and query panel.

Voice samples are limited to 15 seconds and 2 MB.

## Commands

| Command | Purpose |
| --- | --- |
| `make setup` | Install Python and web dependencies. |
| `make models` | Download models listed in the manifest. |
| `make assets` | Generate and ingest the two demo books. |
| `make ingest` | Re-ingest demo audio that already exists. |
| `make dev` | Run backend and frontend together. |
| `make check` | Run Ruff, pytest, ESLint, TypeScript, and Vitest. |
| `make preflight` | Print environment, model, ffmpeg, and database readiness. |
| `make bench` | Run the 10-run voice latency benchmark. |
| `make bench-gate` | Run the benchmark and exit non-zero if the profile gate fails. |
| `make bench-novel` | Run latency benchmark cycling across diverse novel questions. |
| `make bench-cold` | Run cold latency measurement without warm-up requests. |
| `make eval` | Run the 20-question Story spoiler evaluation. |
| `make e2e` | Run the Playwright shell test. |
| `make format` | Format Python and web sources. |

`make bench` and `make eval` require a running backend. `make e2e` starts its own servers unless they are already running.

## Architecture

```text
Browser
  Player + Transcript + VoiceDock + TextQuery
        |
        | HTTP / NDJSON
        v
FastAPI
  /api/health      readiness and profile
  /api/books       list, manifest, context preview
  /api/query       typed questions
  /api/voice-query audio upload -> STT -> retrieval -> LLM -> chunked TTS
  /api/upload      audio (.mp3, .m4a, .webm, .m4b) & document (.epub, .pdf, .txt) async upload
  /api/jobs/{id}   live ingestion job status and progress polling
        |
        +-- SQLite + FTS5 (books, words, chunks, chunks_fts, lore_entries, chapters, ingest_jobs)
        +-- faster-whisper
        +-- EmbeddingGemma-2 (256 dimensions)
        +-- Qwen2.5-1.5B-Instruct GGUF via llama.cpp (offline default)
        |   or Gemma 4 / any open-weight model via a self-hosted Ollama or
        |   OpenAI-compatible endpoint
        +-- Kokoro ONNX
```

Retrieval uses the immediate transcript plus hybrid search: NumPy cosine similarity over chunk embeddings and SQLite FTS5 BM25, fused with reciprocal rank fusion. Story mode filters chunks by `end_ms <= t_ms` and clips chunks that substantially overlap the immediate buffer to the parts outside it.

### Content Ingestion Expansion

EchoRead supports bring-your-own audiobooks and documents without request timeout bottlenecks:
- **Asynchronous Ingestion Queue:** Uploads return an ingest job ID immediately. The frontend polls `/api/jobs/{id}` showing live stage transitions and percentage progress bars.
- **Multi-Chapter `.m4b` Audio:** Extracts chapter marks via `ffprobe`, indexes chunks into chapter segments, and stores chapter metadata in SQLite.
- **Document Ingestion (EPUB, PDF & TXT):** Parses EPUB metadata and chapters (via standard library `zipfile` and `xml.etree.ElementTree`), PDFs via [anydoc](https://github.com/firecrawl/anydoc) (fully local; scanned PDFs that would need OCR are rejected with a clear error, never sent to a hosted service), or text chapters, synthesizes audio offline with Kokoro TTS, and directly derives word-level timestamps.

## Privacy

STT, retrieval, and TTS always run locally; uploaded audio and generated transcripts stay under `data/books/`, and the SQLite database is `data/echoread.db`. With the default `LLM_PROVIDER=llama_cpp`, all inference — including the LLM — happens on your machine, and the only network access in normal use is the one-time model download.

If you configure `LLM_PROVIDER=ollama` (or `openai`), the transcribed question, the retrieved excerpts, and the immediate buffer are sent to the endpoint you configure. Point it at a server you control; no third-party hosted APIs are used.

No analytics, telemetry, or accounts are used in either mode.

The Phonon STT model (~156 MB, when selected) is fetched from Hugging Face into `~/.cache/fermion` on first use — `make models` prefetches it; recorded audio itself never leaves the machine.

## Configuration

Settings use the `ECHOREAD_` environment prefix and an optional `.env` file.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ECHOREAD_PROFILE` | `cpu` | `cpu` or `gpu` model and timing profile. |
| `ECHOREAD_HOST` | `127.0.0.1` | Backend bind host. |
| `ECHOREAD_PORT` | `8000` | Backend port. |
| `ECHOREAD_DATA_DIR` | `./data` | Models, books, and database root. |
| `ECHOREAD_MAX_UPLOAD_BYTES` | `52428800` | Upload size limit. |
| `ECHOREAD_MAX_UPLOAD_DURATION_MS` | `1800000` | Upload duration limit. |
| `ECHOREAD_MAX_VOICE_BYTES` | `2097152` | Voice clip size limit. |
| `ECHOREAD_MAX_VOICE_DURATION_MS` | `15000` | Voice clip duration limit. |
| `STT_PROVIDER` / `ECHOREAD_STT_PROVIDER` | `phonon` | `phonon` (Phonon-2.5 via fermion-research) or `whisper` (faster-whisper). |
| `PHONON_MODEL` / `ECHOREAD_PHONON_MODEL` | `phonon-2.5` | Phonon profile name passed to `fermion.load_speech`. |
| `LLM_PROVIDER` / `ECHOREAD_LLM_PROVIDER` | `ollama` | `llama_cpp` (offline), `ollama`, or `openai` (OpenAI-compatible endpoint). |
| `LLM_ENDPOINT` / `ECHOREAD_LLM_ENDPOINT` | `http://127.0.0.1:11434` | Endpoint used by the `ollama`/`openai` providers. |
| `LLM_MODEL` / `ECHOREAD_LLM_MODEL` | `gemma4:e2b` | Model tag for the `ollama`/`openai` providers. |
| `LLM_THINK` / `ECHOREAD_LLM_THINK` | `false` | Ask thinking-capable models to reason; thought tags are stripped either way. |
| `LLM_TIMEOUT` / `ECHOREAD_LLM_TIMEOUT` | `60` | LLM request timeout in seconds. |

The GPU profile expects the small English Whisper model, Qwen2.5-3B, and a CUDA-capable GPU with enough memory for the selected models. The development machine's MX550 with 2 GB is not sufficient.

## Known limitations

- With the local llama.cpp provider the standard-benchmark CPU TTFA is p50 1895 ms / p95 2549 ms (PASS), but novel questions need ~2–7 s of CPU prompt prefill. With the remote Ollama provider, TTFA is a consistent ~2.8–3.8 s and local STT/TTS dominate. See [BENCHMARKS.md](local-docs/BENCHMARKS.md).
- Cold first queries immediately after server start take ~18–20 s due to on-demand model loading into RAM; models are not pre-warmed at startup.
- Word highlighting is driven by media `timeupdate`, not `requestAnimationFrame`.
- The waveform is decorative; it does not use decoded audio peaks.
- The latency HUD only appears when the `Latency` toggle is enabled.
- Uploads are processed asynchronously with a small in-process worker pool; jobs are not persisted across server restarts.

## Documentation

- [Implementation plan](local-docs/IMPLEMENTATION-PLAN.md)
- [Product requirements](local-docs/PRD.md)
- [Architecture and state machines](local-docs/DIAGRAMS-AND-FSM.md)
- [Benchmark method and results](local-docs/BENCHMARKS.md)
- [Spoiler evaluation method and results](local-docs/EVALS.md)

## License

Licensed under the [Apache License 2.0](LICENSE). The bundled demo narration is generated from public-domain and authored sources recorded in `data/books/*/provenance.json`; model weights keep their upstream licenses and are downloaded, not distributed.
