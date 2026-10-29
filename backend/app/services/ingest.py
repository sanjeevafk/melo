from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from backend.app import db
from backend.app.services.embeddings import EMBEDDING_DIM, get_embedder
from backend.app.services.stt import BaseSTT, TranscriptWord, get_batch_stt

MAX_CHUNK_WORDS = 120
MAX_CHUNK_MS = 45_000


@dataclass(frozen=True)
class WordTimingInput:
    word: str
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class IngestResult:
    book_id: str
    chunks: int
    words: int


def _source_tokens(source_text: str) -> list[str]:
    return re.findall(r"\S+", source_text)


def _coerce_words(words: list[TranscriptWord] | list[WordTimingInput]) -> list[WordTimingInput]:
    result = []
    for word in words:
        if not word.word.strip():
            continue
        result.append(
            WordTimingInput(
                word=word.word.strip(),
                start_ms=max(0, int(word.start_ms)),
                end_ms=max(int(word.start_ms) + 1, int(word.end_ms)),
            )
        )
    return result


def _chunk_ranges(words: list[WordTimingInput]) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    start = 0
    while start < len(words):
        end = start
        while end < len(words) and end - start < MAX_CHUNK_WORDS:
            if end > start and words[end].end_ms - words[start].start_ms > MAX_CHUNK_MS:
                break
            end += 1
        if end == start:
            end = start + 1
        ranges.append((start, end))
        start = end
    return ranges


def ingest_book(
    *,
    book_id: str,
    title: str,
    author: str | None,
    audio_path: Path,
    duration_ms: int,
    source_text: str,
    source_type: str,
    default_mode: str,
    provenance: dict[str, Any] | None = None,
    hotwords: list[str] | None = None,
    words: list[TranscriptWord] | list[WordTimingInput] | None = None,
    chapter: int | None = None,
    chapters: list[Any] | None = None,
    db_path: Path | None = None,
    stt: BaseSTT | None = None,
) -> IngestResult:
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio not found: {audio_path}")
    if source_type not in {"demo_audio", "audio_upload", "document_tts"}:
        raise ValueError(f"Unsupported source_type: {source_type}")
    if default_mode not in {"story", "study"}:
        raise ValueError(f"Unsupported default_mode: {default_mode}")
    eff_source_type = "audio_upload" if source_type == "document_tts" else source_type

    if words is None:
        engine = stt or get_batch_stt()
        transcript, words = engine.transcribe(audio_path, hotwords=hotwords)
        if not source_text:
            source_text = transcript

    word_timings = _coerce_words(words)
    if not word_timings:
        raise ValueError("No words to ingest")

    tokens = _source_tokens(source_text)
    text_tokens = (
        tokens if len(tokens) == len(word_timings) else [word.word for word in word_timings]
    )
    ranges = _chunk_ranges(word_timings)

    chunk_texts = [" ".join(text_tokens[start:end]) for start, end in ranges]
    embedder = get_embedder()
    embeddings = embedder.encode_documents(chunk_texts)
    if embeddings.shape != (len(chunk_texts), EMBEDDING_DIM):
        raise ValueError("Embedding model returned an unexpected shape")

    db.init_db(db_path)
    now = datetime.now(UTC).isoformat()
    hotwords_json = json.dumps(hotwords, ensure_ascii=False) if hotwords else None
    provenance_json = json.dumps(provenance, ensure_ascii=False) if provenance else None

    with db.get_connection(db_path) as connection:
        existing = connection.execute(
            "SELECT id FROM chunks WHERE book_id = ?", (book_id,)
        ).fetchall()
        if existing:
            connection.executemany(
                "DELETE FROM chunks_fts WHERE chunk_id = ?",
                [(row["id"],) for row in existing],
            )
        connection.execute("DELETE FROM books WHERE id = ?", (book_id,))
        connection.execute(
            """
            INSERT INTO books (
              id, title, author, source_type, default_mode, duration_ms,
              audio_path, hotwords_json, provenance_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                book_id,
                title,
                author,
                eff_source_type,
                default_mode,
                int(duration_ms),
                str(audio_path),
                hotwords_json,
                provenance_json,
                now,
            ),
        )

        for index, ((start, end), chunk_text, embedding) in enumerate(
            zip(ranges, chunk_texts, embeddings, strict=True)
        ):
            chunk_id = f"{book_id}:c{index:04d}"
            start_ms = word_timings[start].start_ms
            end_ms = max(start_ms + 1, word_timings[end - 1].end_ms)
            chunk_chapter = chapter
            if chapters:
                for ch in chapters:
                    ch_id = getattr(ch, "id", None) or (
                        ch.get("id") if isinstance(ch, dict) else None
                    )
                    ch_start = getattr(ch, "start_ms", None) or (
                        ch.get("start_ms") if isinstance(ch, dict) else 0
                    )
                    ch_end = getattr(ch, "end_ms", None) or (
                        ch.get("end_ms") if isinstance(ch, dict) else 0
                    )
                    if ch_start <= start_ms < ch_end:
                        chunk_chapter = ch_id
                        break
            vector = np.asarray(embedding, dtype=np.float32)
            connection.execute(
                """
                INSERT INTO chunks (
                  id, book_id, chunk_index, chapter, start_ms, end_ms, text,
                  embedding, embedding_dim
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk_id,
                    book_id,
                    index,
                    chunk_chapter,
                    start_ms,
                    end_ms,
                    chunk_text,
                    vector.tobytes(),
                    EMBEDDING_DIM,
                ),
            )
            connection.execute(
                "INSERT INTO chunks_fts (chunk_id, text) VALUES (?, ?)",
                (chunk_id, chunk_text),
            )
            for word_index in range(start, end):
                word = word_timings[word_index]
                connection.execute(
                    """
                    INSERT INTO words (book_id, chunk_id, idx, word, start_ms, end_ms)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (book_id, chunk_id, word_index, word.word, word.start_ms, word.end_ms),
                )
        connection.commit()

    if chapters:
        db.save_chapters(book_id, chapters, db_path)

    return IngestResult(book_id=book_id, chunks=len(ranges), words=len(word_timings))
