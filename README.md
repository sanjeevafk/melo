# EchoRead

EchoRead is a local audiobook companion that answers questions from the listener's current position without revealing later events. It combines a React player, a FastAPI backend, local speech-to-text, local retrieval, a local LLM, and local text-to-speech.

Everything runs on your machine. Audio, transcripts, and questions are not sent to a hosted model.

## Status

This repository contains a working v0.1 MVP:

- Story mode with a hard spoiler horizon and grounded, refusal-first answers.
- Study mode that may add clearly labelled background knowledge.
- Synchronized, clickable transcript with Story redaction.
- Hold-to-talk voice questions and a typed-query fallback.
- Local MP3 upload and ingestion.
- Local benchmark and spoiler-evaluation scripts.

The CPU latency acceptance gate is not met on the current development machine. See [BENCHMARKS.md](local-docs/BENCHMARKS.md) for measured results. Spoiler evaluation passes 20/20; see [EVALS.md](local-docs/EVALS.md).

## Voice latency

The CPU profile targets p50 <= 3000 ms and p95 <= 4000 ms for time-to-first-audio. The latest 10-run benchmark (2026-10-20) measured **p50 3652 ms / p95 4635 ms**, so the gate is a **FAIL** on both bounds. The `tts_first_sentence_ms` timing field now measures the first TTS chunk, not a full sentence.

To reduce time-to-first-audio, EchoRead:

- streams the first TTS chunk from the first complete clause or a short word-capped prefix, extended past dangling function words;
- removes spoken-only openers such as "The main idea so far is that" while keeping the displayed answer unchanged;
- uses `beam_size=1` and skips word timestamps for voice STT;
- plays Kokoro audio at speed `1.15`.

Tradeoffs: the first chunk can start mid-sentence, `beam_size=1` may modestly reduce transcription accuracy, and faster playback changes pacing.


## What it does

### Story mode

Story mode answers only from:

- the last 90 seconds of transcript immediately before the playhead;
- earlier chunks that end at or before the playhead.

Future chunks are never inserted into the prompt. If no evidence is retrieved and the question is not anchored in the immediate transcript, EchoRead refuses before calling the LLM. LLM refusal variants are canonicalized to one exact sentence.

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
- Use `Add audio` to upload a local MP3 up to 5 MB and 180 seconds.
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
  /api/upload      audio (.mp3, .m4a, .webm, .m4b) & document (.epub, .txt) async upload
  /api/jobs/{id}   live ingestion job status and progress polling
        |
        +-- SQLite + FTS5 (books, words, chunks, chunks_fts, lore_entries, chapters, ingest_jobs)
        +-- faster-whisper
        +-- EmbeddingGemma-2 (256 dimensions)
        +-- Qwen2.5-1.5B-Instruct GGUF via llama.cpp
        +-- Kokoro ONNX
```

Retrieval uses the immediate transcript plus hybrid search: NumPy cosine similarity over chunk embeddings and SQLite FTS5 BM25, fused with reciprocal rank fusion. Story mode filters chunks by `end_ms <= t_ms` and drops chunks that substantially overlap the immediate buffer.

### Content Ingestion Expansion

EchoRead supports bring-your-own audiobooks and documents without request timeout bottlenecks:
- **Asynchronous Ingestion Queue:** Uploads return an ingest job ID immediately. The frontend polls `/api/jobs/{id}` showing live stage transitions and percentage progress bars.
- **Multi-Chapter `.m4b` Audio:** Extracts chapter marks via `ffprobe`, indexes chunks into chapter segments, and stores chapter metadata in SQLite.
- **Document Ingestion (EPUB & TXT):** Parses EPUB metadata and chapters (via standard library `zipfile` and `xml.etree.ElementTree`) or text chapters, synthesizes audio offline with Kokoro TTS, and directly derives word-level timestamps.

## Privacy

All inference is local. The only network access in normal use is the one-time model download. Uploaded audio and generated transcripts stay under `data/books/`; the SQLite database is `data/echoread.db`.

No analytics, telemetry, accounts, or cloud APIs are used.

## Configuration

Settings use the `ECHOREAD_` environment prefix and an optional `.env` file.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ECHOREAD_PROFILE` | `cpu` | `cpu` or `gpu` model and timing profile. |
| `ECHOREAD_HOST` | `127.0.0.1` | Backend bind host. |
| `ECHOREAD_PORT` | `8000` | Backend port. |
| `ECHOREAD_DATA_DIR` | `./data` | Models, books, and database root. |
| `ECHOREAD_MAX_UPLOAD_BYTES` | `5242880` | Upload size limit. |
| `ECHOREAD_MAX_UPLOAD_DURATION_MS` | `180000` | Upload duration limit. |
| `ECHOREAD_MAX_VOICE_BYTES` | `2097152` | Voice clip size limit. |
| `ECHOREAD_MAX_VOICE_DURATION_MS` | `15000` | Voice clip duration limit. |

The GPU profile expects the small English Whisper model, Qwen2.5-3B, and a CUDA-capable GPU with enough memory for the selected models. The development machine's MX550 with 2 GB is not sufficient.

## Known limitations

- The measured CPU voice TTFA on the standard benchmark is p50 1895 ms / p95 2549 ms, passing the 3000/4000 ms gate with a hard 4–5-word first TTS chunk and overlapped audio scheduling.
- Novel questions (`make bench-novel`) bypass llama.cpp prompt caching and require ~2–7 s for CPU first-token prompt evaluation. Cold first queries immediately after server start take ~18–20 s due to on-demand model loading into RAM.
- `npm audit` reports no vulnerabilities after the Vitest 5 development-dependency upgrade.
- Word highlighting is driven by media `timeupdate`, not `requestAnimationFrame`.
- The waveform is decorative; it does not use decoded audio peaks.
- Upload accepts MP3 only. EPUB, PDF, and full-length audiobooks are out of scope for v0.1.

## Documentation

- [Implementation plan](local-docs/IMPLEMENTATION-PLAN.md)
- [Product requirements](local-docs/PRD.md)
- [Architecture and state machines](local-docs/DIAGRAMS-AND-FSM.md)
- [Benchmark method and results](local-docs/BENCHMARKS.md)
- [Spoiler evaluation method and results](local-docs/EVALS.md)
