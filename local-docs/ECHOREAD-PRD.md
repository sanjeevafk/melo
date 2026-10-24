# Product Requirements Document: EchoRead

**Product:** EchoRead — Local Spoiler-Free Audiobook Companion
**Source of truth:** Derived from the Hacktoberfest 2026 workspace README (`README.md`), which reflects the implemented state of `echoread/` at commit `08ea271`.
**Status:** Current implementation baseline (v0.1)
**Date:** 2026-10-24

> Note: This PRD supersedes the aspirational specs in `echoread/local-docs/PRD.md` and `echoread/local-docs/prd-mvp.md`, which still describe cloud APIs (Groq, Deepgram, Cartesia, PostgreSQL/pgvector) and a 1.2s time-to-first-audio target. The shipped product is fully local, CPU-first, and gates at p50 < 3000ms. Where those documents conflict with the README, this PRD follows the README.

---

## 1. Problem Statement

Audiobook listeners who want to ask a question mid-playback face a broken loop:

1. **Context switching:** Stopping playback, switching apps, and typing a query breaks immersion and is impractical hands-busy (commuting, chores, exercise).
2. **Spoilers:** Generic LLM or web queries about fiction return plot events from later chapters, because models are trained on the full text.
3. **Lost deixis:** Questions like *"Wait, what did he mean by that?"* are unanswerable without the transcript immediately preceding the playhead.

EchoRead closes this loop entirely on-device: the listener holds a key, asks a question, and gets a grounded spoken answer based only on what they have already heard — with no cloud dependency and no privacy trade-off.

## 2. Goals

| # | Goal | Measure |
| :--- | :--- | :--- |
| G1 | Spoiler-free answers by construction | 20/20 pass on the spoiler evaluation suite (`local-docs/EVALS.md`) |
| G2 | Natural conversational latency on commodity CPU | p50 voice-loop latency < 3000ms (`make bench`) |
| G3 | Zero cloud dependencies | No network calls at inference time; all models local and open-weight |
| G4 | Reliable local setup | `make preflight` verifies environment, model weights, ffmpeg, and DB readiness in one step |

## 3. Non-Goals (v0.1)

- Cloud LLM / STT / TTS providers of any kind.
- Mobile or native apps; the client is a desktop web app (React/Vite).
- Multi-user accounts, authentication, or billing.
- EPUB/M4B ingestion (deferred — see §10 Roadmap).
- GPU requirement; the latency gate is defined and measured on CPU.

## 4. Target Users

- **The Immersive Listener** — reads fiction audiobooks; wants character and plot questions answered without learning anything that happens after the playhead.
- **The Active Learner** — listens to lectures, papers, or technical material; wants full-document context, including content ahead of the playhead.
- **Hackathon evaluators (Hacktoberfest/DEV/MLH)** — assess local open-weight AI integration, latency, and eval-backed correctness; served by the preflight/bench/eval tooling.

## 5. Functional Requirements

### P0 — Shipped

- **FR-1 Story Mode (strict spoiler horizon).** Answers are grounded only in content played up to the current playhead, plus the preceding 90 seconds. Questions about unrevealed content receive a single canonical, grounded refusal rather than an improvised one. Retrieval-level enforcement: transcript chunks with `end_time_ms > current_playhead` are excluded from context.
- **FR-2 Study Mode (global retrieval).** Retrieval spans the entire book/document, including content ahead of the playhead. Responses drawing on content beyond the played region are prefixed with `Beyond the document:` so the listener can tell grounded-past from ahead-of-playhead context.
- **FR-3 Synchronized audio & transcript.** Clickable transcript synchronized to playback; seeking by clicking a transcript line.
- **FR-4 Real-time transcript redaction.** In Story Mode, unplayed transcript sections are visually redacted in the UI so the written text cannot spoil either.
- **FR-5 Hold-to-talk voice loop.** User holds a key/clicks to talk; local STT transcribes the query; local LLM generates the answer; local TTS streams spoken playback. Audio ducks/pauses during the exchange.
- **FR-6 Local model stack.** Whisper (`beam_size=1`) for STT; llama.cpp serving Qwen2.5-3B for generation; Kokoro TTS streaming chunked playback at 1.15x speed for responses.

### P1 — Fast-follow candidates

- **FR-7 Real waveform.** Replace decorative waveforms with peak data decoded via the Web Audio API (README contribution area 3).
- **FR-8 Format expansion.** EPUB and M4B ingestion alongside MP3 (README contribution area 2).
- **FR-9 Latency optimization track.** Prompt caching and Kokoro chunk-streaming improvements toward a lower p50/p95 gate, and GPU-path support (README contribution area 1).

## 6. User Journeys

### 6.1 Story Mode question loop

1. User plays an ingested audiobook; transcript follows the audio in real time, future text redacted.
2. At a confusing moment, the user holds the talk control; audio pauses.
3. User asks, e.g., *"Who is that character again?"* — local Whisper transcribes it.
4. Context assembler injects the 90-second pre-playhead buffer verbatim (pronoun resolution) plus temporally filtered retrieved excerpts (FTS5 RAG).
5. Qwen2.5-3B answers under the closed-world constraint; if the answer lies beyond the horizon, the canonical refusal is returned.
6. Kokoro streams the spoken answer at 1.15x; playback resumes.

### 6.2 Study Mode question loop

Identical, except retrieval is unbounded in time and cross-document synthesis is allowed; any material from beyond the played region is verbally flagged with `Beyond the document:`.

## 7. Architecture (as built)

```
[React + TypeScript + Vite + Tailwind (web shell)]
   │  audio player, zero-layout-shift transcript, hold-to-talk capture
   ▼ HTTP / streaming
[FastAPI backend (Python 3.11/3.12)]
   ├── STT: local Whisper (beam_size=1)
   ├── Context engine: SQLite FTS5 RAG
   │     ├── immediate buffer: [playhead − 90s, playhead] verbatim slice
   │     └── temporal filter: end_time_ms <= playhead  (Story Mode only)
   ├── LLM: llama.cpp / Qwen2.5-3B (local, open-weight)
   └── TTS: Kokoro, streaming chunked playback @ 1.15x
```

- **Package management:** `uv` (Python), `npm` (Node 22).
- **Storage:** SQLite (transcript chunks + FTS5 index); no external database.
- **Design docs:** FSM and diagrams in `echoread/local-docs/DIAGRAMS-AND-FSM.md`; implementation plan in `IMPLEMENTATION-PLAN.md`.

## 8. Non-Functional Requirements

| Requirement | Target |
| :--- | :--- |
| Voice-loop latency (question end → first audio out) | p50 < 3000ms on CPU, measured by `make bench` over 10 runs |
| Novel-question latency (cache-cold) | Measured separately via `make bench-novel` to prevent cache-masked results |
| Privacy | All speech, inference, and synthesis on-device; zero outbound calls at runtime |
| Environment reproducibility | `make setup` + `make models` + `make preflight` yields a runnable system |
| Code quality gate | `make check` (Ruff, pytest, ESLint, TypeScript, Vitest) passes |
| Spoiler safety | 100% pass on the 20-case spoiler evaluation suite |

## 9. Success Metrics

- **Spoiler safety:** 20/20 pass rate on `local-docs/EVALS.md` (currently achieved).
- **Latency:** p50 < 3000ms on the benchmark suite; trend tracked in `local-docs/BENCHMARKS.md`.
- **Refusal quality:** Spoiler-refusals are always the canonical grounded refusal — never hallucinated plot detail.
- **Setup success:** New machine reaches `make dev` running backend `:8000` + frontend `:5173` via documented commands only.

## 10. Roadmap (from README contribution areas)

1. **Voice latency reduction (P1):** prompt caching, Kokoro chunk-streaming tuning; CPU p50 headroom below 3000ms, then GPU path.
2. **Format expansion (P2):** EPUB and M4B parsers/ingestion.
3. **Real waveform (P2):** Web Audio API peak decoding replacing the decorative waveform.
4. **Community packaging (P2):** submit EchoRead's local RAG + open-weight model integration to weekly Hacktoberfest DEV challenges (Hacktoberfest 2026 theme: "AI Belongs to Everyone"; rewards via virtual stickers across 24 activities, not PRs).

## 11. Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| LLM leaks pre-trained plot knowledge despite temporal filtering | Closed-world system prompt + canonical refusal + 20-case eval suite run as a gate |
| Mid-chunk spoilers (chunk spans the playhead) | Temporal filter on chunk `end_time_ms`; 90s buffer sliced verbatim at the playhead |
| Cache-masked latency numbers | Separate novel-question benchmark (`make bench-novel`) |
| CPU too slow on low-end machines | beam_size=1 Whisper, 3B-class quantized model, chunked TTS streaming; latency gate defined on CPU to keep claims honest |
| UI layout shift during transcript streaming | Zero-layout-shift transcript requirement in the web shell (covered by tests) |
