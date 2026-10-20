export type Mode = "story" | "study";
export type ModelStatus = "ready" | "loading" | "missing";
export type DbStatus = "ready" | "error";

export interface HealthResponse {
  ready: boolean;
  profile: "cpu" | "gpu";
  models: Record<string, ModelStatus>;
  db: DbStatus;
}

export interface Provenance {
  source: string;
  license: string;
  narrator?: string | null;
  generated_at?: string | null;
  source_url?: string | null;
  excerpt_start_ms?: number | null;
  excerpt_end_ms?: number | null;
}

export interface WordTiming {
  word: string;
  start_ms: number;
  end_ms: number;
  chunk_id: string;
}

export interface ImmediateWord {
  word: string;
  start_ms: number;
  end_ms: number;
}

export interface ChunkMeta {
  id: string;
  chapter: number | null;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string | null;
  duration_ms: number;
  default_mode: Mode;
}

export interface ChapterMeta {
  id: number;
  title: string;
  start_ms: number;
  end_ms: number;
}

export type IngestJobState =
  | "queued"
  | "transcribing"
  | "chunking"
  | "embedding"
  | "synthesizing"
  | "completed"
  | "failed";

export interface IngestJobStatus {
  id: string;
  status: IngestJobState;
  stage?: string | null;
  progress_pct: number;
  book_id?: string | null;
  error?: string | null;
  manifest?: BookManifest | null;
}

export interface BookManifest {
  id: string;
  title: string;
  author: string | null;
  default_mode: Mode;
  duration_ms: number;
  audio_url: string;
  provenance: Provenance | null;
  chapters?: ChapterMeta[];
  chunks: ChunkMeta[];
  words: WordTiming[];
}

export interface LoreEntry {
  id: number;
  book_id: string;
  t_ms: number;
  mode: Mode;
  question: string;
  answer: string;
  retrieved_chunk_ids: string[];
  created_at: string;
}

export interface RetrievedExcerpt {
  chunk_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  rrf_score: number;
  vector_score: number | null;
  vector_rank: number | null;
  fts_score: number | null;
  fts_rank: number | null;
}

export interface ContextPreview {
  t_ms: number;
  cutoff_ms: number;
  buffer_start_ms: number;
  immediate_text: string;
  immediate_words: ImmediateWord[];
  retrieved: RetrievedExcerpt[];
  blocked_chunks: number;
  active_chunk_id: string | null;
  active_chunk_truncated: boolean;
  mode: Mode;
}

export interface HistoryTurn {
  question: string;
  answer: string;
}

export interface QueryRequest {
  book_id: string;
  t_ms: number;
  mode: Mode;
  question: string;
  history?: HistoryTurn[];
}

export interface QueryTimings {
  retrieval_ms: number;
  llm_first_token_ms: number;
  total_ms: number;
}

export interface QueryResponse {
  answer: string;
  context: ContextPreview;
  timings: QueryTimings;
}

export interface TTSRequest {
  text: string;
  voice?: string;
}

export interface StatusEvent {
  type: "status";
  stage: string;
}

export interface TranscriptEvent {
  type: "transcript";
  text: string;
}

export interface ContextEvent extends ContextPreview {
  type: "context";
}

export interface AnswerDeltaEvent {
  type: "answer_delta";
  text: string;
}

export interface AnswerEvent {
  type: "answer";
  text: string;
}

export interface AudioEvent {
  type: "audio";
  seq: number;
  text: string;
  wav_b64: string;
  sample_rate: number;
}

export interface VoiceTimings {
  stt_ms: number;
  retrieval_ms: number;
  llm_first_token_ms: number;
  tts_first_sentence_ms: number;
  total_ms: number;
}

export interface TimingsEvent extends VoiceTimings {
  type: "timings";
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
}

export interface DoneEvent {
  type: "done";
}

export type VoiceEvent =
  | StatusEvent
  | TranscriptEvent
  | ContextEvent
  | AnswerDeltaEvent
  | AnswerEvent
  | AudioEvent
  | TimingsEvent
  | ErrorEvent
  | DoneEvent;
