# Latency benchmarks

## Acceptance criteria

EchoRead defines voice time-to-first-audio as:

```text
total_ms = stt_ms + retrieval_ms + llm_first_token_ms + tts_first_sentence_ms
```

The `voice-query` endpoint reports this value in its `timings` event. Despite its
name, `tts_first_sentence_ms` now measures the **first TTS chunk**, not a full
sentence. The first chunk is a complete clause or a short word-capped prefix.

The gate is:

| Profile | p50 | p95 |
| --- | --- | --- |
| GPU | 1200 ms | 1500 ms |
| CPU | 3000 ms | 4000 ms |

`make bench-gate` exits non-zero when the measured profile misses either bound.

## Method

`scripts/bench_latency.py` sends real HTTP requests to a running backend. It does not mock STT, retrieval, the LLM, or TTS.

- Endpoint: `POST /api/voice-query`
- Fixture: `backend/app/tests/fixtures/question.wav`, spoken as "What is the main idea so far?"
- Book: `styles-ch2`
- Playhead: `t_ms=60000`
- Mode: `story`
- Runs: 10 recorded after 1 unrecorded warm-up
- Profile: read from `/api/health`
- Percentiles: linear interpolation over the recorded samples

Reproduce with the backend running:

```bash
make dev
# in another terminal
make bench-gate
```

## Environment

- Date: 2026-10-20
- Host: Linux 7.0.0-38-generic, x86_64
- CPU: 13th Gen Intel Core i5-1335U, 10 cores / 12 threads
- Memory: 15 GiB
- Profile: `cpu`
- Python: 3.12.12, `uv` 0.10.2
- STT: faster-whisper `base.en`, int8, `beam_size=1`, no word timestamps for voice
- LLM: Qwen2.5-1.5B-Instruct Q4_K_M GGUF, llama.cpp, CPU
- Embeddings: EmbeddingGemma-2, float32, 256 dimensions
- TTS: Kokoro `af_heart`, int8 ONNX, CPU, speed `1.15`

## Results

Command:

```bash
uv run python -m scripts.bench_latency --runs 10 --warmup 1 --assert
```

Per-run samples (Standard benchmark, repeated question with warm prompt cache):

| Run | STT | Retrieval | LLM first token | TTS first chunk | Total | Wall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 | 1125 | 106 | 59 | 492 | 1782 | 12836 |
| 02 | 986 | 85 | 41 | 566 | 1678 | 27326 |
| 03 | 1084 | 91 | 52 | 524 | 1751 | 19737 |
| 04 | 1354 | 112 | 189 | 722 | 2377 | 9262 |
| 05 | 1149 | 81 | 71 | 535 | 1836 | 19622 |
| 06 | 1402 | 383 | 147 | 673 | 2605 | 20254 |
| 07 | 1164 | 105 | 46 | 639 | 1954 | 18643 |
| 08 | 1412 | 225 | 283 | 560 | 2480 | 11819 |
| 09 | 1168 | 132 | 49 | 633 | 1982 | 18115 |
| 10 | 1092 | 89 | 45 | 567 | 1793 | 15451 |

Percentiles:

| Stage | p50 | p95 |
| --- | ---: | ---: |
| STT | 1156 ms | 1408 ms |
| Retrieval | 106 ms | 312 ms |
| LLM first token | 56 ms | 241 ms |
| TTS first chunk | 566 ms | 700 ms |
| Total TTFA | 1895 ms | 2549 ms |
| Wall HTTP | 18379 ms | 24144 ms |

Mean TTFA: 2024 ms.

Gate result:

```text
Gate (cpu): p50 <= 3000ms, p95 <= 4000ms · PASS
```

## Novel and cold benchmark results

To measure latency honestly without prompt-cache and warm-model optimizations, `scripts/bench_latency.py` provides `--novel` (cycling across diverse questions and playheads) and `--cold` (disabling warm-up requests):

```bash
uv run python -m scripts.bench_latency --novel --runs 10 --warmup 1
```

Per-run samples (Novel questions benchmark):

| Run | Question | STT | Retrieval | LLM first token | TTS first chunk | Total | Wall |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 | Who arrived at Styles Court? | 1229 | 86 | 48 | 571 | 1934 | 4353 |
| 02 | Why was the narrator invited? | 1132 | 101 | 0 | 1403 | 2636 | 2696 |
| 03 | What does John Cavendish do? | 1241 | 114 | 6488 | 700 | 8543 | 15013 |
| 04 | Where did Hastings meet John? | 1254 | 199 | 0 | 2656 | 4109 | 4184 |
| 05 | What did Evelyn Howard say? | 1344 | 336 | 8157 | 766 | 10603 | 17187 |
| 06 | Who arrived at Styles Court? | 1326 | 186 | 4918 | 568 | 6998 | 9969 |
| 07 | Why was the narrator invited? | 1228 | 81 | 0 | 1426 | 2735 | 2803 |
| 08 | What does John Cavendish do? | 1199 | 104 | 5591 | 676 | 7570 | 21347 |
| 09 | Where did Hastings meet John? | 1199 | 207 | 0 | 1644 | 3050 | 3133 |
| 10 | What did Evelyn Howard say? | 1073 | 87 | 7505 | 591 | 9256 | 13701 |

Novel percentiles:

| Stage | p50 | p95 |
| --- | ---: | ---: |
| STT | 1228 ms | 1336 ms |
| Retrieval | 109 ms | 278 ms |
| LLM first token | 2483 ms | 7864 ms |
| TTS first chunk | 733 ms | 2201 ms |
| Total TTFA | 5554 ms | 9997 ms |
| Wall HTTP | 7161 ms | 19475 ms |

Mean novel TTFA: 5743 ms.

Novel gate result:

```text
Gate (cpu): p50 <= 3000ms, p95 <= 4000ms · FAIL
```

### Cold model loading

Immediately upon a cold start (without warm-up), models are loaded into RAM lazily:
- SentenceTransformer embedding model load: ~6–7 s.
- Qwen2.5-1.5B llama.cpp GGUF load: ~9–10 s.
- A cold first query immediately after restart measures `total_ms` in the ~18–20 s range. Once loaded into memory, subsequent queries run in normal warm execution.

## Interpretation

The standard gate now **passes** decisively on CPU:
- p50 total is 1895 ms (well under the 3000 ms target).
- p95 total is 2549 ms (well under the 4000 ms target).

The primary driver of closing the gate was capping the first TTS chunk to 4–5 words and synthesizing it immediately before concurrent background synthesis starts. Previously, `take_first_tts_chunk()` allowed up to 12 words for sentences, 10 words for clauses, and 11 words for fallback prefixes, resulting in TTS synthesis taking 1424 ms p50 / 2157 ms p95 due to CPU thread contention between ONNX and the LLM. With the hard 4–5-word cap, first-chunk synthesis dropped to 566 ms p50 / 700 ms p95 (more than 60% faster).

Prompt caching and model warmth nuances:
- **Standard benchmark:** Reuses the question and playhead across runs. llama.cpp leverages KV/prompt caching so `llm_first_token` is 56 ms p50 / 241 ms p95.
- **Novel questions:** When querying novel topics or positions, llama.cpp must evaluate prompt tokens from scratch on CPU, increasing `llm_first_token` to 2483 ms p50 / 7864 ms p95. Fast refusals (`llm_first_token=0`) synthesize the standard refusal text.
- **Wall HTTP:** Reflects streaming generation, synthesis, and transfer of the entire answer text across all chunks.

## Optimizations in the measured build

- **Client-side Web Audio overlapped queue.** Audio buffers schedule on the AudioContext timeline using `source.start(nextStartTime)`, eliminating inter-sentence acoustic gaps without blocking incoming NDJSON chunks. PTT interruption immediately aborts the active stream and flushes playing sources.
- **Backend TTS pipelining.** The first audio chunk is synthesized synchronously on the main thread for minimum TTFA, while subsequent sentences ($N \ge 1$) are pipelined concurrently in a background worker pool as the LLM stream emits completed sentences.
- **Dynamic CPU prompt budgeting.** On CPU profiles, retrieval reduces the immediate audio buffer from 90 s to 45 s and caps hybrid retrieval results at top-3 (instead of top-5), conserving CPU cycles during prompt evaluation.
- **Hard 4–5-word first TTS chunk.** `take_first_tts_chunk()` enforces a hard cap of 4 words (extending to at most 5 words only to prevent ending on a dangling function word) across sentences, clauses, and fallbacks. This keeps early audio synthesis under 700 ms even under CPU contention.
- **Spoken-only preamble stripping.** `strip_spoken_preamble()` removes conversational openers such as "The main idea so far is that" from audio. The displayed answer keeps the full text.
- **Faster voice STT.** CPU STT uses `beam_size=1`; voice queries skip word timestamps.
- **Faster TTS playback.** Kokoro speed is `1.15`.

Tradeoffs:

- The first audio chunk is shorter (4–5 words), so audio starts speaking earlier while slightly increasing the number of overall chunk boundaries.
- `beam_size=1` can modestly reduce transcription accuracy compared with wider beams, though tests confirm high accuracy on test phrases.
- Skipping word timestamps removes per-word timing metadata for voice queries.
- Prompt cache acceleration applies only when identical or highly overlapping prompt prefixes are queried. Novel queries on CPU take several additional seconds for first-token evaluation.

## Remaining limitations and future improvements

1. **Hardware acceleration.** Use the GPU profile on CUDA hardware with sufficient VRAM (>4 GB) to reduce both STT and LLM evaluation times.
2. **Novel query prompt evaluation.** On CPU, novel queries experience 2–7 s first-token latency because llama.cpp cannot reuse KV cache prefixes across distinct contexts. Speculative decoding, smaller quantized draft models, or prompt compression could help close this gap.
3. **STT optimizations.** Investigating distilled Whisper variants (e.g. distil-whisper) or aggressive voice activity silence trimming could shave 200–400 ms from STT.
4. **TTS threading.** Further profiling ONNX session intra-op threading options for Kokoro under heavy CPU loads.

## Addendum 2026-10-24: remote open-weight LLM (Gemma 4 via Ollama)

The LLM provider now defaults to a self-hosted Ollama endpoint running `gemma4:e2b`
(4.6B, Q4_K_M). STT, embeddings, and TTS remain local. With `LLM_PROVIDER=llama_cpp`
the configuration above applies unchanged.

3-run spot checks (same host, same fixture; small samples, not percentile-grade):

| Benchmark | STT p50 | Retrieval p50 | LLM first token p50 | TTS first chunk p50 | Total p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard (repeated question) | 1480 ms | 166 ms | 346 ms | 1359 ms | 3324 ms |
| Novel (cycling questions) | 1181 ms | 215 ms | 303 ms | 1295 ms | 3015 ms |

- The novel-query blow-up is gone: first token is ~300–520 ms regardless of prompt-cache state, so TTFA is now a consistent ~2.8–3.8 s in both benchmarks.
- The gate reads FAIL on p50 by a small margin (3324 ms vs 3000 ms); the budget is now dominated by local STT (~1.1–1.5 s) and local TTS first chunk (~1.3–1.7 s), not the LLM.
- TTFA with the remote LLM was re-measured after the buffer-overlap clip fix (retrieved excerpts are clipped to the parts outside the immediate buffer instead of being dropped, which can add unique earlier evidence to the prompt).
