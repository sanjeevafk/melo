from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from backend.app import db
from backend.app.config import settings
from backend.app.prompts import render_prompt
from backend.app.schemas import (
    ContextPreview,
    ImmediateWord,
    RetrievedExcerpt,
)
from backend.app.services.embeddings import EMBEDDING_DIM, get_embedder

BUFFER_MS = 90_000
BUFFER_MS_CPU = 45_000
RRF_K = 60
CANDIDATE_K = 20
FINAL_K = 5
FINAL_K_CPU = 3


def get_prompt_budget() -> tuple[int, int]:
    """Return (buffer_ms, final_k) based on execution profile."""
    if settings.is_gpu:
        return BUFFER_MS, FINAL_K
    return BUFFER_MS_CPU, FINAL_K_CPU


@dataclass(frozen=True)
class ChunkRecord:
    id: str
    chunk_index: int
    chapter: int | None
    start_ms: int
    end_ms: int
    text: str
    embedding: np.ndarray


@dataclass(frozen=True)
class ContextResult:
    preview: ContextPreview
    prompt: list[dict[str, str]]
    retrieved_chunks: list[RetrievedExcerpt]


def _chunks(rows: list[object]) -> list[ChunkRecord]:
    records: list[ChunkRecord] = []
    for row in rows:
        vector = np.frombuffer(row["embedding"], dtype=np.float32)
        if vector.size != EMBEDDING_DIM:
            continue
        records.append(
            ChunkRecord(
                id=row["id"],
                chunk_index=int(row["chunk_index"]),
                chapter=row["chapter"],
                start_ms=int(row["start_ms"]),
                end_ms=int(row["end_ms"]),
                text=row["text"],
                embedding=vector,
            )
        )
    return records


def _words(rows: list[object]) -> list[ImmediateWord]:
    return [
        ImmediateWord(word=row["word"], start_ms=int(row["start_ms"]), end_ms=int(row["end_ms"]))
        for row in rows
    ]


def _top_semantic(
    chunks: list[ChunkRecord], query_vector: np.ndarray, k: int = CANDIDATE_K
) -> list[tuple[ChunkRecord, float, int]]:
    if not chunks:
        return []
    matrix = np.stack([chunk.embedding for chunk in chunks])
    scores = matrix @ query_vector
    order = np.argsort(-scores, kind="stable")[:k]
    return [(chunks[index], float(scores[index]), rank + 1) for rank, index in enumerate(order)]


def _match_query(question: str) -> str:
    tokens = list(dict.fromkeys(re.findall(r"[a-z0-9]+", question.lower())))
    return " OR ".join(f'"{token}"' for token in tokens)


def _top_fts(
    book_id: str,
    question: str,
    end_ms: int | None,
    chunks_by_id: dict[str, ChunkRecord],
    k: int = CANDIDATE_K,
) -> list[tuple[ChunkRecord, float, int]]:
    rows = db.fts_search(book_id, _match_query(question), end_ms=end_ms, limit=k)
    results: list[tuple[ChunkRecord, float, int]] = []
    for rank, row in enumerate(rows, start=1):
        chunk = chunks_by_id.get(row["chunk_id"])
        if chunk is not None:
            results.append((chunk, float(row["score"]), rank))
    return results


def _rrf(
    semantic: list[tuple[ChunkRecord, float, int]],
    keyword: list[tuple[ChunkRecord, float, int]],
) -> list[RetrievedExcerpt]:
    chunk_map: dict[str, ChunkRecord] = {}
    fused: dict[str, float] = {}
    vector_meta: dict[str, tuple[float, int]] = {}
    fts_meta: dict[str, tuple[float, int]] = {}

    for chunk, score, rank in semantic:
        chunk_map[chunk.id] = chunk
        fused[chunk.id] = fused.get(chunk.id, 0.0) + 1.0 / (RRF_K + rank)
        vector_meta[chunk.id] = (score, rank)

    for chunk, score, rank in keyword:
        chunk_map[chunk.id] = chunk
        fused[chunk.id] = fused.get(chunk.id, 0.0) + 1.0 / (RRF_K + rank)
        fts_meta[chunk.id] = (score, rank)

    ordered = sorted(
        fused,
        key=lambda chunk_id: (-fused[chunk_id], chunk_map[chunk_id].chunk_index),
    )
    results: list[RetrievedExcerpt] = []
    for chunk_id in ordered:
        chunk = chunk_map[chunk_id]
        vector_score, vector_rank = vector_meta.get(chunk_id, (None, None))
        fts_score, fts_rank = fts_meta.get(chunk_id, (None, None))
        results.append(
            RetrievedExcerpt(
                chunk_id=chunk.id,
                start_ms=chunk.start_ms,
                end_ms=chunk.end_ms,
                text=chunk.text,
                rrf_score=fused[chunk_id],
                vector_score=vector_score,
                vector_rank=vector_rank,
                fts_score=fts_score,
                fts_rank=fts_rank,
            )
        )
    return results


def _overlap_ratio(chunk: ChunkRecord, start_ms: int, end_ms: int) -> float:
    overlap_start = max(chunk.start_ms, start_ms)
    overlap_end = min(chunk.end_ms, end_ms)
    if overlap_end <= overlap_start:
        return 0.0
    duration = max(1, chunk.end_ms - chunk.start_ms)
    return (overlap_end - overlap_start) / duration


def build_context(
    book: db.BookRecord,
    t_ms: int,
    mode: str,
    question: str = "",
    recent_turns: list[tuple[str, str]] | None = None,
    db_path: Path | None = None,
) -> ContextResult:
    buffer_ms, final_k = get_prompt_budget()
    t = min(max(0, t_ms), book.duration_ms)
    buffer_start = max(0, t - buffer_ms)

    immediate_words = _words(
        db.get_word_rows(book.id, start_ms=buffer_start, end_ms=t, db_path=db_path)
    )
    immediate_text = " ".join(word.word for word in immediate_words)

    if mode == "story":
        eligible_rows = [
            row for row in db.get_chunk_rows(book.id, db_path=db_path) if row["end_ms"] <= t
        ]
        blocked_chunks = db.count_chunks_after(book.id, t, db_path=db_path)
        active_chunk = db.get_active_chunk(book.id, t, db_path=db_path)
        active_chunk_truncated = active_chunk is not None
        cutoff_ms = t
        fts_end_ms = t
    else:
        eligible_rows = db.get_chunk_rows(book.id, db_path=db_path)
        blocked_chunks = 0
        active_chunk = None
        active_chunk_truncated = False
        cutoff_ms = book.duration_ms
        fts_end_ms = None

    eligible_chunks = _chunks(eligible_rows)
    chunks_by_id = {chunk.id: chunk for chunk in eligible_chunks}
    retrieved: list[RetrievedExcerpt] = []

    if question.strip() and eligible_chunks:
        query_vector = get_embedder().encode_query(question)
        semantic = _top_semantic(eligible_chunks, query_vector)
        keyword = _top_fts(book.id, question, fts_end_ms, chunks_by_id)
        retrieved = _rrf(semantic, keyword)
        retrieved = [
            excerpt
            for excerpt in retrieved
            if _overlap_ratio(chunks_by_id[excerpt.chunk_id], buffer_start, t) < 0.5
        ][:final_k]

    if mode == "story":
        history: list[tuple[str, str]] = []
    else:
        history = (recent_turns or [])[-2:]

    prompt = render_prompt(
        mode=mode,
        book=book,
        immediate_text=immediate_text,
        retrieved=retrieved,
        question=question,
        t_ms=t,
        recent_turns=history,
    )

    preview = ContextPreview(
        t_ms=t,
        cutoff_ms=cutoff_ms,
        buffer_start_ms=buffer_start,
        immediate_text=immediate_text,
        immediate_words=immediate_words,
        retrieved=retrieved,
        blocked_chunks=blocked_chunks,
        active_chunk_id=active_chunk["id"] if active_chunk else None,
        active_chunk_truncated=active_chunk_truncated,
        mode="story" if mode == "story" else "study",
    )
    return ContextResult(preview=preview, prompt=prompt, retrieved_chunks=retrieved)


def retrieval_ready() -> bool:
    return (settings.embedding_model_dir / "model.safetensors").exists()
