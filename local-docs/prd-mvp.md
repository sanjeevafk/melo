# PRD: EchoRead MVP (Investor & Hackathon Edition)

**Subtitle:** Voice-First Interactive Audio Player with Temporal RAG & Visual Spoiler Shield  
**Target Platform:** Desktop Web Application (Optimized for Chrome / Chromium browsers)  
**Target Release:** v0.1 Hackathon & Investor Demo  
**Status:** Approved for Implementation  

---

## 1. Executive Summary & Demo Objective

### 1.1 The Demo Goal
Deliver an unmistakable **"Aha!" moment** in under 90 seconds for hackathon judges and venture investors. The demo proves that interactive voice companions can interrupt audio playback hands-free, answer deictic and contextual questions with sub-second latency, and mathematically guarantee zero plot spoilers through strict temporal retrieval.

### 1.2 Core Value Proposition on Display
1. **Zero-Latency Ingestion Friction:** Pre-loaded flagship audio/books with pre-computed word-level timestamps allow testing in 2 seconds.
2. **Push-to-Talk Hands-Free Illusion:** Spacebar or one-click push-to-talk with instant audio ducking and soft acoustic chime (`earcon`).
3. **The "Temporal Horizon" UI:** A real-time visual proof showing past context ("Safe Zone"), the rolling 90s immediate buffer, and future chapters locked behind the "Spoiler Shield".
4. **Sub-Second Voice Loop:** Streaming STT -> Temporal Hybrid Search -> Streaming LLM -> Streaming TTS back to the user in `< 1.2 seconds`.
5. **Seamless Narrative Cadence:** Automatic 5-second rewind upon resuming playback.

---

## 2. The 90-Second "Hero Demo" Script

```
[00:00 - 00:20] Hook:
Play audio from pre-loaded fiction mystery (e.g., The Mysterious Affair at Styles).
Waveform plays, synchronized text highlights word-by-word.

[00:20 - 00:35] The Interrupt:
User holds [Spacebar]. 
Audio instantly ducks to pause. Soft 150ms chime plays.
User asks: "Wait, who is Mary and why is she acting suspicious about the locked cabinet?"

[00:35 - 00:50] The Agent & Visual Proof:
Companion voice replies in under 1 second:
"Mary Cavendish is John's wife. She was startled because the key to the poison dispensary went missing this morning."
UI simultaneously lights up:
- 90s Immediate Context Buffer highlighted in blue.
- "Spoiler Shield: 14 future chunks blocked" badge displayed.

[00:50 - 01:05] Auto-Rewind:
User releases spacebar. Audio rewinds 5 seconds and resumes smoothly.

[01:05 - 01:25] The Contrast (Story vs. Study Mode):
Toggle to "Study Mode" with an AI/Tech lecture clip.
User asks: "Can you explain backpropagation using an analogy?"
Agent draws across the whole document and provides a clear conceptual analogy.
```

---

## 3. Pre-Loaded Flagship Demo Content

To guarantee 100% demo reliability without depending on live 20-minute audio uploads during a pitch:

| Demo Asset | Title | Format | Duration | Demo Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Asset 1 (Story Mode)** | *Agatha Christie: The Mysterious Affair at Styles (Ch. 2)* | Pre-aligned `.mp3` + `.json` tokens | ~5 mins | **Zero-Spoiler Proof:** Proving the agent refuses to disclose the killer or unrevealed clues even when pressed. |
| **Asset 2 (Study Mode)** | *Attention Is All You Need (Paper Summary / Audio Overview)* | Pre-aligned `.mp3` + `.json` tokens | ~4 mins | **Global Synthesis:** Explaining complex architectural concepts and cross-referencing later sections. |
| **Asset 3 (BYOC Quick Test)** | *User Short File Upload* | `.mp3` (max 5 MB / 3 mins) | Variable | Live transcription & alignment via local faster-whisper. |

---

## 4. MVP Functional Scope

### In-Scope (Must Have for Demo)
* **FR-1: Desktop Web Audio Player:** Custom player with Play/Pause, Seek, Playback Speed (1x, 1.2x, 1.5x), and live progress scrubber.
* **FR-2: Push-to-Talk (PTT) Trigger:**
  * Hold `[Spacebar]` or click & hold the microphone button to speak.
  * Audio immediately pauses, plays a 150ms activation chime, and streams mic audio.
  * Releasing `[Spacebar]` triggers silence endpointing and starts LLM generation.
* **FR-3: Word-Synchronized Transcript Display:** Auto-scrolling text view with real-time highlighting of the spoken word.
* **FR-4: Temporal Spoiler Guard (SQL/Vector level):** Hard retrieval filter `end_time_ms <= current_playback_ms` when in Story Mode.
* **FR-5: Rolling 90s Immediate Context Buffer:** Inject verbatim transcript of `[current_ms - 90s, current_ms]` into the LLM system prompt to resolve deictic references (*"he"*, *"she"*, *"that thing"*).
* **FR-6: Sub-Second Voice Response:** Streaming TTS output played back to the user over Web Audio API.
* **FR-7: Auto-Rewind Cadence:** Automatically seeks back 5,000ms before resuming playback.
* **FR-8: Visual "Inspector & Spoiler Shield" Panel:**
  * Displays:
    * Active temporal cutoff timestamp.
    * Real-time RAG retrieved excerpts.
    * Count of future chunks suppressed by the spoiler guard.
* **FR-9: Listening Mode Toggle:** One-click switch between **Story Mode** (Strict Temporal Filter) and **Study Mode** (Global Retrieval).

### Out-of-Scope (Deferred Post-MVP)
* Native iOS/Android apps or background mobile audio session handling.
* Full-length 20-hour audiobook uploads (kept to 5-minute pre-loaded demos and short custom uploads).
* User authentication and persistent multi-tenant billing.
* Offline / on-device LLM inference.

---

## 5. UI/UX Specification

```
+-----------------------------------------------------------------------------------+
|  [EchoRead Logo]             Demo Book: Mysterious Affair at Styles   [Mode: Story] |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [  Waveform & Scrub Bar  ]  03:42 / 05:15   [ 5s Rewind ] [ Play/Pause ] [ 1.2x ] |
|  [=======================>---------------------------]                            |
|   |--- SAFE CONTEXT ZONE ---| [CURSOR] |--- LOCKED SPOILER SHIELD (PADLOCK) ------| |
|                                                                                   |
+-------------------------------------------------+---------------------------------+
| SYNCHRONIZED TRANSCRIPT                         | TEMPORAL CONTEXT & AGENT DRAWER |
|                                                 |                                 |
| "...Poirot took the small key from his pocket.  | [Mic Active: "Listening..."]    |
| Mary stepped backward toward the window. Her    |                                 |
| hands trembled noticeably as she spoke..."      | > User: "Why is Mary nervous?"  |
|                                                 |                                 |
|                                                 | > Echo Agent (Speaking):         |
|                                                 | "Mary just discovered that the  |
|                                                 | key to the poison cabinet is    |
|                                                 | missing."                       |
|                                                 |                                 |
|                                                 | --- Visual Proof -------------- |
|                                                 | [Shield Active]: 18 future      |
|                                                 | chunks blocked.                 |
|                                                 | [Immediate Buffer]: 90s tokens  |
+-------------------------------------------------+---------------------------------+
| Bottom Bar: [Hold Spacebar to Ask Question]    Latency TTFA: 890ms               |
+-----------------------------------------------------------------------------------+
```

---

## 6. Architecture & Local ML Stack

```
[Browser Client (Vite + React + Tailwind CSS)]
   │
   ├── Web Audio API (Playback, 150ms Procedural Chime, Volume Ducking/Fading, 5s Rewind)
   ├── MediaRecorder API (Capture audio on Spacebar hold or Mic click)
   └── UI Layer (Synchronized Word Transcript, Waveform Horizon Scrubber, Inspector Drawer)
         │
         ▼ (HTTP POST / WebSocket Streaming)
[FastAPI Backend (Python 3.11/3.12)]
   │
   ├──► 1. Speech-to-Text: faster-whisper (base.en / small.en) local inference (~180ms)
   │
   ├──► 2. Context Engine:
   │       ├── Extract [t - 90s, t] verbatim slice from SQLite / in-memory cache
   │       └── Hybrid Temporal Search: Google EmbeddingGemma-2 (768d / 256d MRL) + SQLite FTS
   │           Filter: `WHERE end_time_ms <= current_playback_ms` (in Story Mode)
   │
   ├──► 3. Local LLM Reasoning: llama-cpp-python (Qwen2.5-3B-Instruct / Llama-3.2-3B Q4_K_M)
   │       Enforces strict Closed-World prompt constraint.
   │
   └──► 4. Local Streaming TTS: Kokoro-82M (kokoro-onnx)
           Streams audio chunks back to Web Audio player via chunked response / WebSocket.
```

---

## 7. Data Structure (Pre-Loaded Demo Schema)

```typescript
// Sample Book Structure (JSON / SQLite)
interface BookManifest {
  id: string;
  title: string;
  author: string;
  audio_url: string;
  duration_ms: number;
  mode: "story" | "study";
  chunks: TranscriptChunk[];
}

interface TranscriptChunk {
  id: string;
  chapter: number;
  start_time_ms: number;
  end_time_ms: number;
  text: string;
  embedding?: number[];
  words: {
    word: string;
    start_ms: number;
    end_ms: number;
  }[];
}
```

---

## 8. Latency Budget (Target: `< 1,200ms`)

| Phase | Target | Tech Component |
| :--- | :--- | :--- |
| **1. Endpointing / PTT Release** | ~50ms | Key release event (Spacebar up) |
| **2. Speech-to-Text (STT)** | ~200ms | Groq Whisper-Turbo / Deepgram Nova-2 |
| **3. Context Retrieval** | ~30ms | In-memory slice + SQLite-vec query |
| **4. LLM Time to First Token** | ~220ms | Groq (Llama-3.3-70B) / Gemini 2.5 Flash |
| **5. Streaming TTS First Chunk** | ~280ms | Cartesia Sonic WebSocket |
| **Network & Browser Buffering** | ~100ms | Web Audio AudioContext decode |
| **Total Time-to-First-Audio (TTFA)** | **~880ms** | Masked by soft 100ms thinking acoustic tone |

---

## 9. Hackathon / Pitch Success Criteria

1. **Zero Demo Crashes:** Pre-loaded assets ensure the demo never fails on stage due to upload or network processing issues.
2. **Sub-Second Voice Response:** Audible response begins before the judge/investor loses conversational patience (`< 1.2s`).
3. **Visually Verifiable Spoiler Protection:** Judges can clearly see future text locked out in real-time on the "Temporal Horizon" UI.
4. **Intuitive Deictic Understanding:** Asking *"Why did he say that?"* immediately resolves to the line spoken in the preceding 90 seconds.
