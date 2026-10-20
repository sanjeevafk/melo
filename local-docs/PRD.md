# PRD & Technical Design Document: **EchoRead** (Working Title)

**Subtitle:** A Vertical-Agnostic, Voice-First Interactive Audio Player with Temporal RAG

**Status:** Draft / MVP Specification

**Target Release:** v0.1 (Web/Mobile PWA MVP)

---

## 1. Executive Summary & Problem Statement

### 1.1 Problem

Audiobooks, podcasts, and recorded lectures are inherently passive mediums consumed while the user's hands and eyes are occupied (commuting, exercising, doing chores). When a listener encounters an unfamiliar concept, loses track of a character, or misses a crucial premise:

1. Stopping playback, unlocking the phone, switching apps, and typing a search query breaks cognitive flow and is often physically unsafe (e.g., while driving).
2. Standard LLM queries or web searches about fiction books frequently return plot spoilers from later chapters.
3. Deictic voice queries (e.g., *"Wait, what did he mean by that?"*) fail without immediate transcript context from the exact moment of playback.

### 1.2 Solution

An intelligent, Bring-Your-Own-Content (BYOC) audio and document player that embeds a low-latency voice agent directly into the playback loop. Users can interrupt playback hands-free, ask a contextual question by voice, receive a spoiler-safe or domain-grounded spoken clarification, and seamlessly resume playback.

---

## 2. Target Personas & Use Cases

| Persona | Content Type | Core Pain Point | Required Agent Behavior |
| --- | --- | --- | --- |
| **The Immersive Listener** | Fiction Audiobooks (`.m4b`, `.mp3`, `.epub`) | Forgetting who a character is or why a faction matters in a dense novel (e.g., *Dune*, *The Silmarillion*) without getting spoiled. | **Strict Temporal Bound:** Only retrieves context up to the exact playback millisecond. Zero external web/training leakage. |
| **The Active Learner** | Textbooks, Technical Docs, Lectures (`.pdf`, `.mp3`, URLs) | Hitting a dense paragraph, mathematical intuition, or undefined acronym while listening on the go. | **Full-Document + Web Synthesis:** Can reference later glossary chapters and external knowledge to explain concepts using analogies. |
| **The Commuter Researcher** | Academic Papers, Industry Reports (`.pdf`, `.md`) | Wanting to interrogate methodology or bookmark insights hands-free without stopping to take notes. | **Interactive Analyst:** Answers structural questions across the paper and logs the Q&A exchange as a timestamped note. |

---

## 3. User Journey & Core Interaction Loop

1. **Ingest:** User uploads an audio file (`.mp3`, `.m4b`) or text document (`.epub`, `.pdf`) and selects a **Listening Mode** (*Story Mode*, *Study Mode*, or *Custom*).
2. **Listen:** Audio plays normally. A rolling 90-second transcript buffer is maintained in local client state.
3. **Interrupt:** User triggers the agent via **Hardware Media Button** (double-tap earbuds/headset) or **Voice Wake Word** (*"Pause"* / *"Hey Echo"*).
* *System Action:* Audio pauses immediately, logs `current_timestamp_ms`, and plays a soft 150ms acoustic readiness chime.


4. **Query:** User speaks naturally (e.g., *"Who is Baron Vladimir again, and why is he mad at the Duke?"*).
5. **Synthesize & Speak:** The agent resolves pronouns using the 90-second rolling buffer, executes a temporally filtered hybrid search, and streams a concise voice response in a distinct "companion" voice.
6. **Resume (or Follow-up):**
* In **Story Mode:** After a 1.5-second silence window following the answer, the player rewinds the audiobook by **5 seconds** from `current_timestamp_ms` and fades playback back in.
* In **Study Mode:** The agent leaves a 4-second mic window open for follow-up questions before auto-resuming.



---

## 4. Functional Requirements (Prioritized)

### P0: Must-Have for MVP

* **FR-1 (Dual Ingestion Pipeline):** Support uploading `.mp3`/`.m4b` audio files (transcribed with word/sentence timestamps) and `.epub`/`.pdf` text files (converted to audio via TTS with mapped timestamps).
* **FR-2 (Temporal Spoiler Guard):** Hard metadata filter (`end_time_ms <= current_playback_ms`) enforced at the database query level when *Story Mode* is active.
* **FR-3 (Immediate Context Buffer):** Inject the verbatim transcript of the `[current_playback_ms - 90s, current_playback_ms]` window into the LLM system prompt to resolve ambiguous pronouns (*"this"*, *"that"*, *"he"*).
* **FR-4 (Voice-to-Voice Loop):** Hands-free STT capture, streaming LLM generation, and low-latency streaming TTS output with automatic playback ducking/pausing.
* **FR-5 (Auto-Rewind Resume):** Automatically seek back `5000ms` upon resuming book playback to restore narrative cadence.

### P1: Fast-Follow

* **FR-6 (Auto-Generated Voice Bookmarks / Lore Log):** Automatically save every user voice query, the book snippet that triggered it, the timestamp, and the AI's explanation into a searchable timeline view.
* **FR-7 (Customizable Agent Profiles):** User-configurable sliders/toggles for Temporal Scope (*Strict / Chapter / Full*), External Web Access (*On / Off*), Persona (*Lorekeeper / Socratic Tutor / Concise Explainer*), and Response Length.
* **FR-8 (Hardware Media Key Hook):** Map MediaSession API `nexttrack` or double-pause events to trigger the voice query microphone so users don't have to rely on noisy wake-word detection outdoors.

---

## 5. System Architecture & Technical Design

### 5.1 High-Level Data Flow

```
[Client Player (PWA/Mobile)]
   │ (1. Pause @ 01:14:20 + Voice Audio Stream)
   ▼
[FastAPI / Edge Orchestrator]
   ├──► [Streaming STT (Deepgram / Whisper)] ──► User Query Text
   │
   ├──► [Context Assembler]
   │       ├──► 1. Immediate Buffer: Fetch transcript [01:12:50 - 01:14:20]
   │       └──► 2. Hybrid RAG Query (BM25 + Dense Vector)
   │               Filter: book_id == X AND (if StoryMode: end_time_ms <= 4460000)
   │
   ├──► [LLM Router (Groq / Gemini Flash)] ──► Token Stream
   │
   └──► [Streaming TTS Engine] ──► Audio Chunks back to Client Player

```

### 5.2 Database Schema (PostgreSQL + `pgvector` or Turso/LibSQL)

**Table 1: `media_items**`

* `id` (UUID, PK)
* `user_id` (UUID)
* `title` (TEXT)
* `source_type` (ENUM: `audio_upload`, `document_tts`, `podcast_rss`)
* `default_mode` (ENUM: `story`, `study`, `custom`)
* `mode_config` (JSONB) — *Stores `temporal_bound`, `allow_web_search`, `persona_prompt`, `rewind_ms*`

**Table 2: `transcript_chunks**`

* `id` (UUID, PK)
* `media_id` (UUID, FK, Indexed)
* `chunk_index` (INT)
* `chapter_number` (INT)
* `start_time_ms` (BIGINT, Indexed) — *Crucial for temporal range queries*
* `end_time_ms` (BIGINT, Indexed)
* `content` (TEXT)
* `fts_vector` (TSVECTOR) — *For BM25 exact name/acronym matching*
* `embedding` (VECTOR(768)) — *For semantic similarity*

**Table 3: `voice_bookmarks` (The Lore/Study Log)**

* `id` (UUID, PK)
* `media_id` (UUID, FK)
* `playback_timestamp_ms` (BIGINT)
* `user_query` (TEXT)
* `agent_response` (TEXT)
* `context_snippet` (TEXT)
* `created_at` (TIMESTAMP)

---

### 5.3 The Temporal Hybrid Retrieval Query

Pure vector search struggles with unique fantasy character names, specific acronyms, or technical terms. A **Hybrid Search (Reciprocal Rank Fusion of Dense Vector + Full-Text Search)** combined with a hard temporal SQL filter ensures both accuracy and zero spoilers:

```sql
WITH semantic_matches AS (
    SELECT id, content, start_time_ms, end_time_ms,
           RANK() OVER (ORDER BY embedding <=> :query_embedding) AS vector_rank
    FROM transcript_chunks
    WHERE media_id = :media_id
      -- Hard Temporal Spoiler Guard (conditionally applied based on Listening Mode)
      AND (:is_story_mode = FALSE OR end_time_ms <= :current_playback_ms)
    LIMIT 20
),
keyword_matches AS (
    SELECT id, content, start_time_ms, end_time_ms,
           RANK() OVER (ORDER BY ts_rank_cd(fts_vector, plainto_tsquery('english', :query_text)) DESC) AS fts_rank
    FROM transcript_chunks
    WHERE media_id = :media_id
      AND (:is_story_mode = FALSE OR end_time_ms <= :current_playback_ms)
      AND fts_vector @@ plainto_tsquery('english', :query_text)
    LIMIT 20
)
SELECT COALESCE(s.id, k.id) AS chunk_id,
       COALESCE(s.content, k.content) AS content,
       COALESCE(s.start_time_ms, k.start_time_ms) AS start_time_ms,
       -- Reciprocal Rank Fusion (RRF) score
       (COALESCE(1.0 / (60 + s.vector_rank), 0.0) + COALESCE(1.0 / (60 + k.fts_rank), 0.0)) AS rrf_score
FROM semantic_matches s
FULL OUTER JOIN keyword_matches k ON s.id = k.id
ORDER BY rrf_score DESC
LIMIT 5;

```

---

### 5.4 Prompt Engineering: Preventing Pre-Training Leakage

Even if your RAG database filters out chapters 5–20, an LLM already knows from its pre-training weights that *Darth Vader is Luke's father* or who the killer is in an Agatha Christie novel. In **Story Mode**, the system prompt must enforce a strict **Closed-World Assumption**:

> **System Prompt (`Story Mode`):**
> *"You are an in-the-moment audiobook companion. You MUST answer the user's question using ONLY the provided `<immediate_transcript>` and `<retrieved_past_excerpts>`. Do NOT use any external or pre-trained knowledge about this book, its characters, or its plot. If the answer is not present in the provided excerpts, state simply: 'That hasn't been revealed in the book yet up to where you are listening.' Keep your response conversational, under 3 sentences, and suitable for spoken audio."*

---

## 6. Non-Functional Requirements & Latency Budget

For a voice interface to feel natural while listening to an audiobook, **Time-to-First-Audio (TTFA)** must stay under **1.2 seconds**.

| Pipeline Stage | Target Latency | Recommended Stack / Optimization |
| --- | --- | --- |
| **1. Voice Activity Detection (VAD) & Endpointing** | ~250ms | Silero VAD (client-side WebAssembly) to detect end-of-speech immediately. |
| **2. Speech-to-Text (STT)** | ~200ms | Deepgram Nova-2 (WebSocket streaming) or Groq Whisper-Large-v3-Turbo. |
| **3. Temporal Hybrid Retrieval** | ~80ms | Supabase (`pgvector` + HNSW index) with composite index on `(media_id, end_time_ms)`. |
| **4. LLM Time-to-First-Token (TTFT)** | ~250ms | Llama-3.3-70B on Groq or Gemini 2.5 Flash with sentence-level streaming. |
| **5. Streaming TTS (First Chunk)** | ~300ms | Cartesia Sonic, ElevenLabs Flash, or Kokoro-82M (self-hosted/edge) streaming on first sentence boundary. |
| **Total Time-to-First-Audio (TTFA)** | **~1,080ms** | Masked with a subtle "thinking" ambient earcon at `t = 300ms`. |

---

## 7. Edge Cases & Mitigations

1. **Mid-Chunk Spoilers:**
* *Issue:* If a semantic chunk is 60 seconds long (`01:14:00` to `01:15:00`) and the user pauses at `01:14:10`, the remaining 50 seconds of that chunk might contain a plot twist.
* *Mitigation:* Store word-level or sentence-level timestamp arrays inside each chunk's metadata, and dynamically slice the active chunk's text right at `current_playback_ms` before injecting it into the immediate buffer.


2. **Noisy Environments / False Wake-Words:**
* *Issue:* Speaker audio from the book itself triggers the microphone wake word, or wind noise cuts off the user's question.
* *Mitigation:* Only activate the microphone *after* playback is paused via hardware double-tap or an explicit wake word backed by WebRTC Acoustic Echo Cancellation (AEC).


3. **Long Audio File Ingestion Delay:**
* *Issue:* A 20-hour `.m4b` audiobook takes too long to transcribe and embed upfront before the user can press play.
* *Mitigation:* **Progressive Chunk Ingestion.** Transcribe and index the first 15 minutes immediately (~5 seconds processing time) so playback can start right away, while a background worker queues the remaining chapters asynchronously.



---

## 8. Success Metrics (KPIs)

* **Voice Query Resolution Rate:** % of voice queries where the user allows auto-resume without immediately re-triggering the mic to rephrase the question.
* **Latency P95:** 95th percentile Time-to-First-Audio (TTFA) `< 1.5s`.
* **Zero-Spoiler Rate (Eval Benchmark):** 100% pass rate on a synthetic evaluation dataset of 50 plot-twist questions asked at early timestamps of popular public-domain mystery novels.
* **Bookmark Engagement:** % of sessions where a user views or exports their auto-generated *Voice Bookmark / Study Log* after finishing a listening session.