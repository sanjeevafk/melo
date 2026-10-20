from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Mode = Literal["story", "study"]
ModelStatus = Literal["ready", "loading", "missing"]
DbStatus = Literal["ready", "error"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Provenance(ApiModel):
    source: str
    license: str
    narrator: str | None = None
    generated_at: str | None = None
    source_url: str | None = None
    excerpt_start_ms: int | None = None
    excerpt_end_ms: int | None = None


class WordTiming(ApiModel):
    word: str
    start_ms: int
    end_ms: int
    chunk_id: str


class ImmediateWord(ApiModel):
    word: str
    start_ms: int
    end_ms: int


class ChunkMeta(ApiModel):
    id: str
    chapter: int | None
    start_ms: int
    end_ms: int
    text: str


class ChapterMeta(ApiModel):
    id: int
    title: str
    start_ms: int
    end_ms: int


class BookSummary(ApiModel):
    id: str
    title: str
    author: str | None
    duration_ms: int
    default_mode: Mode


class BookManifest(ApiModel):
    id: str
    title: str
    author: str | None
    default_mode: Mode
    duration_ms: int
    audio_url: str
    provenance: Provenance | None
    chapters: list[ChapterMeta] = Field(default_factory=list)
    chunks: list[ChunkMeta]
    words: list[WordTiming]


class IngestJobStatus(ApiModel):
    id: str
    status: Literal[
        "queued", "transcribing", "chunking", "embedding", "synthesizing", "completed", "failed"
    ]
    stage: str | None = None
    progress_pct: int = 0
    book_id: str | None = None
    error: str | None = None
    manifest: BookManifest | None = None


class RetrievedExcerpt(ApiModel):
    chunk_id: str
    start_ms: int
    end_ms: int
    text: str
    rrf_score: float
    vector_score: float | None = None
    vector_rank: int | None = None
    fts_score: float | None = None
    fts_rank: int | None = None


class ContextPreview(ApiModel):
    t_ms: int
    cutoff_ms: int
    buffer_start_ms: int
    immediate_text: str
    immediate_words: list[ImmediateWord]
    retrieved: list[RetrievedExcerpt]
    blocked_chunks: int
    active_chunk_id: str | None
    active_chunk_truncated: bool
    mode: Mode


class HistoryTurn(ApiModel):
    question: str
    answer: str


class QueryRequest(ApiModel):
    book_id: str
    t_ms: int
    mode: Mode
    question: str = Field(min_length=1)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=2)

    @field_validator("t_ms", mode="before")
    @classmethod
    def coerce_t_ms(cls, value: Any) -> int:
        if isinstance(value, (int, float)):
            return int(round(value))
        if isinstance(value, str):
            try:
                return int(round(float(value)))
            except ValueError:
                pass
        return value


class QueryTimings(ApiModel):
    retrieval_ms: int
    llm_first_token_ms: int
    total_ms: int


class QueryResponse(ApiModel):
    answer: str
    context: ContextPreview
    timings: QueryTimings


class LoreEntry(ApiModel):
    id: int
    book_id: str
    t_ms: int
    mode: Mode
    question: str
    answer: str
    retrieved_chunk_ids: list[str] = Field(default_factory=list)
    created_at: str


class CreateLoreRequest(ApiModel):
    t_ms: int = Field(ge=0)
    mode: Mode
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    retrieved_chunk_ids: list[str] = Field(default_factory=list)

    @field_validator("t_ms", mode="before")
    @classmethod
    def coerce_t_ms(cls, value: Any) -> int:
        if isinstance(value, (int, float)):
            return int(round(value))
        if isinstance(value, str):
            try:
                return int(round(float(value)))
            except ValueError:
                pass
        return value


class TTSRequest(ApiModel):
    text: str = Field(min_length=1, max_length=500)
    voice: str | None = None


class HealthResponse(ApiModel):
    ready: bool
    profile: Literal["cpu", "gpu"]
    models: dict[str, ModelStatus]
    db: DbStatus


class ErrorResponse(ApiModel):
    code: str
    message: str


class StatusEvent(ApiModel):
    type: Literal["status"] = "status"
    stage: str


class TranscriptEvent(ApiModel):
    type: Literal["transcript"] = "transcript"
    text: str


class ContextEvent(ContextPreview):
    type: Literal["context"] = "context"


class AnswerDeltaEvent(ApiModel):
    type: Literal["answer_delta"] = "answer_delta"
    text: str


class AnswerEvent(ApiModel):
    type: Literal["answer"] = "answer"
    text: str


class AudioEvent(ApiModel):
    type: Literal["audio"] = "audio"
    seq: int
    text: str
    wav_b64: str
    sample_rate: int = 24_000


class VoiceTimings(ApiModel):
    stt_ms: int
    retrieval_ms: int
    llm_first_token_ms: int
    tts_first_sentence_ms: int
    total_ms: int


class TimingsEvent(VoiceTimings):
    type: Literal["timings"] = "timings"


class ErrorEvent(ApiModel):
    type: Literal["error"] = "error"
    code: str
    message: str


class DoneEvent(ApiModel):
    type: Literal["done"] = "done"
