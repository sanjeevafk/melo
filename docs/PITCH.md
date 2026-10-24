# EchoRead — Jury Pitch Playbook (Open-Source Event Edition)

How to present EchoRead to a jury that judges on **business viability** and **scalability**, at an **open-source event**.

The one strategic move everything below depends on: **do not apologize for being local-only — make it your business model.**
"Everything runs on the user's machine" is not a limitation you work around; it is the reason the unit economics work, the reason privacy is architectural rather than a promise, and the reason scaling to a million users costs almost nothing.

---

## 0. Fix these before you present (judges read the repo)

1. **The README contradicts itself on latency.**
   - "Voice latency" section: latest benchmark (2026-10-20) = p50 3652 ms / p95 4635 ms → **FAIL**.
   - "Known limitations" section: p50 1895 ms / p95 2549 ms → **PASS**.
   Decide which number is current, keep exactly one in the README, and move the other into the history table in `BENCHMARKS.md`. A sharp judge will catch two numbers for the same gate.
2. **The README contradicts itself on upload scope.**
   "Known limitations" says "Upload accepts MP3 only; EPUB, PDF, and full-length audiobooks are out of scope", but the architecture section documents `.mp3/.m4a/.webm/.m4b` upload, EPUB/TXT ingestion, and multi-chapter `.m4b`. Update the limitations list to match the shipped features.
3. **Add a LICENSE file.** There is none at the repo root. At an open-source event, "no license" means "not open source" and can disqualify you on sight. Recommendation in §6.
4. Add 2–3 screenshots or a 60-second GIF to the README — judges who only see the repo should see the product.

Honesty is a feature: if the CPU gate genuinely fails, *say so on the slide* with your optimization roadmap. Published failures + published evals are an OSS credibility signal, but they must be **consistent**.

---

## 1. Elevator pitch (30 seconds — memorize this)

> Audiobook listeners constantly pause and ask "wait, who is this character?" — and looking up the answer online spoils the book.
> EchoRead is an open-source, local-first audiobook companion: hold a button, ask out loud, and it answers **only from what you've already heard** — never ahead of your position. Speech recognition, retrieval, the language model, and the voice all run on your own machine. No cloud, no accounts, nothing leaves the device.
> That's not just privacy — every user brings their own compute, so EchoRead scales to any number of listeners at **zero marginal inference cost**.

---

## 2. Talk track (5 minutes)

| Time | Beat | Key line |
| --- | --- | --- |
| 0:00–0:30 | Hook + problem | "The only medium you can't search is the one people listen to for hours." |
| 0:30–1:00 | Solution framing | Spoiler-aware, voice-first, 100% local. |
| 1:00–2:30 | **Live demo** (§3) | The part the jury remembers. |
| 2:30–3:00 | How it works | One architecture slide; the `end_ms <= playhead` filter. |
| 3:00–4:00 | Business + scalability (§4, §5) | Zero marginal cost; two-axis scaling. |
| 4:00–4:40 | Open-source sustainability (§6) | Contribution surface, reproducible evals, license. |
| 4:40–5:00 | Honest metrics + roadmap + ask (§7) | "We publish our failures." |

---

## 3. Demo script (90 seconds)

1. **Cold open**: press play on *The Mysterious Affair at Styles*. Agatha Christie — everyone in the room instantly understands the spoiler danger.
2. **The spoiler test**: hold Space, ask **"Who killed Emily Inglethorp?"** → EchoRead refuses with the exact canonical sentence. Point at the transcript: later text is dimmed/redacted.
3. **The grounded answer**: ask **"Why do they suspect John?"** → answer built only from chunks before the playhead.
4. **Mode flip**: switch to Study mode, same question → now it adds clearly labelled `Beyond the document:` context. Shows the design is deliberate, not a limitation.
5. **If time**: upload the demo MP3 → async job progress bar → playable with a synced transcript.

**Fallback**: pre-record a 60-second video of this exact flow. Never let a live demo be a single point of failure.

---

## 4. The business case

### Market (verified Oct 2026)

- Global audiobooks: **~$11B in 2025**, projected to **~$58B by 2033 at ~22.7% CAGR** (Grand View Research); other estimates put 2025 at $8–11B with 15–26% CAGR — one of the fastest-growing publishing segments regardless of whose number you use.
- Adjacent segments the same product serves: podcasts, e-learning, and **accessibility in education** (dyslexia, ADHD, low-vision students get equal access to long-form audio comprehension).
- **Wedge**: DRM-free audiobook power users + students listening to papers and lectures — your own demo already includes *Attention Is All You Need*, so say that out loud: "students already study by ear; we give them a tutor that can't leak the ending."

### Why we win (positioning table)

| | Cloud AI wrapper apps | EchoRead |
| --- | --- | --- |
| Marginal cost per query | pays API/GPU per request | **$0** |
| Privacy | audio + text leave the device | **never leaves** |
| Offline | no | **full function** |
| Spoiler control | prompt-hope | **enforced in retrieval** (`end_ms <= playhead`) |
| Cost to serve 100k users | grows with usage | one-time model download (static files) |

### Unit economics

- Serving cost = hosting static model files (CDN). **~100% gross margin on the free product.**
- One maintainer can run the whole thing; there is no on-call, no inference cluster, no per-user bill.
- Compare: any cloud-AI competitor must pay per minute of audio transcribed and per token answered. Their costs grow linearly with success; ours don't.

### Revenue — how an open-source project stays alive (open core)

1. **Now**: GitHub Sponsors / Open Collective.
2. **EchoRead Pro** (personal): device sync, premium voices and larger model packs, priority format support.
3. **EchoRead for Education** (the real business): managed edition for schools and libraries — SSO, class rosters, hosted ingestion for shared/weak hardware. This is where the hosted-deployment variant from §5 lives.
4. **White-label licensing** to publishers and ed-tech who want a spoiler-safe companion for their own catalogs.

### Legal & trust moat

Users process **their own files** on **their own machines** — no content redistribution, so DRM-free ecosystems (LibriVox, purchased MP3s, EPUBs) work without licensing fights, and GDPR/CCPA stop being your problem **by architecture, not by policy**.

---

## 5. The scalability case (two axes — this is the judge-killer slide)

### Axis 1 — Local-first scales horizontally by construction

- Each listener **is** the server: a self-contained FastAPI + SQLite app with zero shared state and zero coordination. 10 users or 10 million — no backend change.
- The only centralized asset is the **one-time model download** — static files, the cheapest scaling problem in computing (CDN, mirrors, torrents).
- The small-model stack (1.5B LLM, 256-dim embeddings, ONNX TTS) is a **deliberate** choice: it runs on ordinary laptops today, and every hardware generation (NPU laptops, Apple silicon, Copilot+ PCs) makes it faster **with zero code changes**. We ride the hardware curve instead of paying to fight it.
- The model manifest + `cpu`/`gpu` profiles mean new and larger models ship as **configuration, not code**.

### Axis 2 — A hosted edition is an upgrade, not a rewrite

The architecture already has the seams (this is what makes Axis 2 credible — say "already built", not "could add"):

| Local choice (today) | Hosted-education edition | Effort |
| --- | --- | --- |
| SQLite + FTS5 | Postgres + pgvector | swap storage layer |
| `ingest_jobs` table + polling | Redis/Celery workers (same job API) | swap queue backend |
| llama.cpp in-process | llama.cpp server / vLLM with batching | swap inference endpoint |
| Single FastAPI process | stateless containers behind a load balancer | deploy only |

The async ingestion queue, NDJSON streaming, and profile system were **designed for this**. Nothing in the code assumes "one laptop" except the deployment config.

**One-line summary for the jury:** *"EchoRead scales down to a laptop and up to a school district without changing architecture — because the heavy work already lives at the edge."*

---

## 6. The open-source case (lead with this — it's an OSS event)

- **Not a wrapper.** Most AI hackathon projects are thin shells over a hosted API. EchoRead integrates an entire local stack — faster-whisper STT, EmbeddingGemma retrieval, Qwen GGUF via llama.cpp, Kokoro ONNX TTS — so contributors can own a whole stage of the pipeline.
- **Contribution surface** (label these as `good-first-issue` before the event):
  - *Languages & voices*: Whisper is multilingual and Kokoro ships many voices → "add a language/voice pack" is a contained PR.
  - *Formats*: `.m4b` chapters already work; PDF, M4A, FLAC are self-contained ingest PRs.
  - *Hardware benchmarks*: `make bench` emits JSON — invite the community to submit runs + machine specs and build a public, crowdsourced performance matrix. A genuinely novel contribution type.
  - *Retrieval & prompting*: the eval harness (`make eval`) makes any change falsifiable.
- **Reproducible science**: `BENCHMARKS.md` and `EVALS.md` are committed, **including a failing gate**. "We publish our failures" is the strongest credibility line you have at an OSS event.
- **License (decide before the event)**: **AGPL-3.0** (+ a CLA) if you want the open-core play from §4 — it blocks cloud providers from offering a closed fork; **Apache-2.0** if maximum adoption is the goal. No license = not open source.
- **Governance**: v0.2 roadmap via GitHub Discussions / RFC issues — shows you're building a community, not just a repo.

---

## 7. Metrics slide (honest numbers)

- Spoiler evaluation: **20/20** (`EVALS.md`).
- Voice time-to-first-audio: **[the one reconciled number from §0]** on CPU, with the named optimizations (first-clause chunking, `beam_size=1`, 1.15× playback) and the roadmap to the gate (GPU profile, quantization, NPU).
- Ingestion: 4 audio formats + EPUB/TXT, multi-chapter `.m4b`, async job queue with live progress.
- Two demo books shipped: fiction (spoiler-sensitive) and a research paper (study mode).

---

## 8. Anticipated jury Q&A

**Q: "Everyone has cheap cloud AI now — why local?"**
A: Three reasons that compound: marginal cost per query is zero instead of linear; the audio and questions never leave the listener's device, which is a legal and trust feature publishers and schools care about; and it works offline — on a plane, on commute, in a classroom with bad Wi-Fi.

**Q: "Most users have weak laptops."**
A: The CPU profile is the baseline and it's measured, not guessed. The model manifest lets us ship lighter tiers, NPU laptops are the fastest-growing segment, and the hosted education edition covers shared or weak hardware — same codebase, different deployment.

**Q: "How is this a business if the product is free and local?"**
A: Open core. The local app stays free forever — that's the community and the distribution. Revenue comes from what organizations need and individuals don't: sync, SSO, rosters, hosted ingestion for schools, libraries, and publishers.

**Q: "What about Audible's DRM?"**
A: Out of scope by design — that legal clarity is a feature. EchoRead works with the DRM-free universe: LibriVox's public-domain catalog, purchased MP3s, EPUBs, lecture recordings, any audio the user owns.

**Q: "How hard is the spoiler guarantee, really?"**
A: Enforced in retrieval, not vibes: chunks are filtered by `end_ms <= playhead`, future chunks never enter the prompt, ungrounded questions are refused **before** the LLM is called, refusals are canonicalized to one sentence, and a 20-question adversarial eval passes 20/20.

**Q: "Isn't a 1.5B model too small to be useful?"**
A: The model doesn't need world knowledge — it needs to summarize retrieved, in-book evidence. Grounded summarization is exactly what small models do well; that's why the architecture is retrieval-heavy and LLM-light, and why it runs on a laptop at all.

**Q: "Why does the CPU latency gate fail / where does latency go?"**
A: [Answer with the reconciled number.] Cold-start is model loading (~18–20 s once); steady-state first-token cost is prompt evaluation on CPU. The fixes are known and on the roadmap: GPU profile, quantized GGUF, KV-cache tuning, NPU runtimes.

**Q: "Who else does this?"**
A: Platform recaps and cloud note-takers exist, but they're cloud-only, not spoiler-aware by construction, and closed. EchoRead is the open, private option, and it serves DRM-free and educational content that platforms ignore.

---

## 9. Slide skeleton (10 slides)

1. **Title** — "Ask your audiobook anything — without spoilers, without the cloud."
2. **Problem** — long-form audio is unsearchable; looking things up spoils; cloud AI costs money and privacy.
3. **Demo** — the §3 flow (live or video).
4. **How it works** — pipeline diagram + the spoiler horizon.
5. **Why different** — the positioning table from §4.
6. **Business** — market, wedge, open-core revenue, ~100% gross margin.
7. **Scalability** — the two-axis slide from §5.
8. **Open source** — contribution surface, reproducible evals, license, "we publish our failures."
9. **Honest metrics** — 20/20 evals, latency + roadmap.
10. **Vision + ask** — "bring your language, your format, your hardware benchmark."

Closing line: *"Long-form audio is half of modern learning, and it's the only medium you can't ask a question. EchoRead makes every book, lecture, and paper answerable — privately, offline, and spoiler-free."*

---

## Market-data sources (verify again the week of the event)

- [Grand View Research — Audiobooks Market](https://www.grandviewresearch.com/industry-analysis/audiobooks-market): $11.0B (2025) → $58.5B (2033), 22.7% CAGR.
- Other 2025 estimates: $8–11B with 15–26% CAGR (Straits Research, Expert Market Research, Mordor Intelligence, Research and Markets).
