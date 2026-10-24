from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest

from backend.app import db
from backend.app.config import settings
from backend.app.prompts import should_refuse_story
from backend.app.services import retrieval
from backend.app.services.retrieval import build_context

BOOK_ID = "guard-book"


class _StubEmbedder:
    def encode_query(self, text: str) -> np.ndarray:
        return np.zeros(256, dtype=np.float32)


def _tokens_for(start_ms: int, end_ms: int, markers: dict[int, str]) -> list[str]:
    """One token per second across [start_ms, end_ms), with named markers."""
    return [
        markers.get(start_ms + offset * 1_000, f"w{start_ms + offset * 1_000}")
        for offset in range((end_ms - start_ms) // 1_000)
    ]


def _insert_book(connection: object) -> None:
    connection.execute(
        """
        INSERT INTO books (
            id, title, author, source_type, default_mode, duration_ms,
            audio_path, hotwords_json, provenance_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
        """,
        (BOOK_ID, "Guard Book", None, "demo_audio", "story", 300_000, "audio.mp3", "2026-01-01"),
    )


def _insert_chunk(
    connection: object,
    chunk_id: str,
    index: int,
    start_ms: int,
    end_ms: int,
    tokens: list[str],
    word_index: int,
) -> int:
    text = " ".join(tokens)
    connection.execute(
        """
        INSERT INTO chunks (
            id, book_id, chunk_index, start_ms, end_ms, text, embedding, embedding_dim
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 256)
        """,
        (chunk_id, BOOK_ID, index, start_ms, end_ms, text, np.zeros(256, np.float32).tobytes()),
    )
    connection.execute("INSERT INTO chunks_fts (chunk_id, text) VALUES (?, ?)", (chunk_id, text))
    for offset, token in enumerate(tokens):
        word_start = start_ms + offset * 1_000
        connection.execute(
            """
            INSERT INTO words (book_id, chunk_id, idx, word, start_ms, end_ms)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (BOOK_ID, chunk_id, word_index + offset, token, word_start, word_start + 500),
        )
    return word_index + len(tokens)


@pytest.fixture()
def guard_book(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    original = settings.data_dir
    settings.data_dir = tmp_path
    settings.ensure_directories()
    db.init_db()
    with db.connect() as connection:
        _insert_book(connection)
        opening = _tokens_for(0, 40_000, {2_000: "arrived", 4_000: "Styles", 16_000: "zebra"})
        opening[0:5] = ["I", "had", "arrived", "at", "Styles"]
        next_index = _insert_chunk(connection, f"{BOOK_ID}:c0000", 0, 0, 40_000, opening, 0)
        middle = _tokens_for(
            40_000,
            80_000,
            {40_000: "quartz", 41_000: "lamps", 43_000: "yonder", 64_000: "beacon"},
        )
        next_index = _insert_chunk(
            connection, f"{BOOK_ID}:c0001", 1, 40_000, 80_000, middle, next_index
        )
        closing = _tokens_for(
            80_000,
            120_000,
            {80_000: "morning", 83_000: "letters", 84_000: "yonder"},
        )
        _insert_chunk(connection, f"{BOOK_ID}:c0002", 2, 80_000, 120_000, closing, next_index)
        connection.commit()
    monkeypatch.setattr(retrieval, "get_embedder", lambda: _StubEmbedder())
    yield
    settings.data_dir = original


def _context(t_ms: int, mode: str, question: str):
    book = db.get_book(BOOK_ID)
    assert book is not None
    return build_context(book=book, t_ms=t_ms, mode=mode, question=question)


def test_chunk_straddling_buffer_survives_clipped(guard_book: None) -> None:
    """The false-refusal regression: t=60s, the only eligible chunk overlaps the
    45s buffer by 62.5%, and the answer sits in the first 15s outside the buffer."""
    question = "Who arrived at Styles?"
    result = _context(60_000, "story", question)

    assert len(result.preview.retrieved) == 1
    excerpt = result.preview.retrieved[0]
    assert excerpt.chunk_id == f"{BOOK_ID}:c0000"
    assert excerpt.start_ms == 0
    assert excerpt.end_ms == 15_000
    assert "arrived" in excerpt.text
    assert "Styles" in excerpt.text
    assert "zebra" not in excerpt.text
    assert not should_refuse_story(
        result.preview.immediate_text, result.preview.retrieved, question
    )


def test_chunk_fully_inside_buffer_is_dropped(guard_book: None) -> None:
    result = _context(45_000, "story", "Who arrived at Styles?")
    assert result.preview.retrieved == []
    assert result.preview.active_chunk_id == f"{BOOK_ID}:c0001"
    assert result.preview.active_chunk_truncated is True


def test_study_mode_clips_buffer_overlap_and_keeps_future_segment(guard_book: None) -> None:
    result = _context(60_000, "study", "quartz yonder beacon")

    by_id = {excerpt.chunk_id: excerpt for excerpt in result.preview.retrieved}
    assert f"{BOOK_ID}:c0001" in by_id
    clipped = by_id[f"{BOOK_ID}:c0001"]
    assert clipped.start_ms == 60_000
    assert clipped.end_ms == 80_000
    assert "beacon" in clipped.text
    assert "quartz" not in clipped.text


def test_active_chunk_is_never_retrieved_in_story_mode(guard_book: None) -> None:
    result = _context(60_000, "story", "quartz yonder beacon")
    assert {excerpt.chunk_id for excerpt in result.preview.retrieved} == {f"{BOOK_ID}:c0000"}


def test_story_prompt_contains_no_future_words(guard_book: None) -> None:
    result = _context(60_000, "story", "Who arrived at Styles?")
    for word in result.preview.immediate_words:
        assert word.start_ms < 60_000
    for excerpt in result.preview.retrieved:
        assert excerpt.end_ms <= 60_000
