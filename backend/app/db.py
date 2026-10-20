from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from backend.app.config import settings

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS books (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT,
  source_type   TEXT NOT NULL CHECK (source_type IN ('demo_audio', 'audio_upload')),
  default_mode  TEXT NOT NULL CHECK (default_mode IN ('story', 'study')),
  duration_ms   INTEGER NOT NULL,
  audio_path    TEXT NOT NULL,
  hotwords_json TEXT,
  provenance_json TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id            TEXT PRIMARY KEY,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  chapter       INTEGER,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  text          TEXT NOT NULL,
  embedding     BLOB NOT NULL,
  embedding_dim INTEGER NOT NULL DEFAULT 256
);

CREATE INDEX IF NOT EXISTS idx_chunks_book_time ON chunks(book_id, start_ms, end_ms);

CREATE TABLE IF NOT EXISTS words (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chunk_id      TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  word          TEXT NOT NULL,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_book_time ON words(book_id, start_ms);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED,
  text,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS lore_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  t_ms          INTEGER NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('story', 'study')),
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  retrieved_chunk_ids_json TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lore_book_time ON lore_entries(book_id, t_ms);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL CHECK (
    status IN (
      'queued', 'transcribing', 'chunking', 'embedding', 'synthesizing', 'completed', 'failed'
    )
  ),
  stage         TEXT,
  progress_pct  INTEGER NOT NULL DEFAULT 0,
  book_id       TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  title         TEXT NOT NULL,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, start_ms);
"""


@dataclass(frozen=True)
class BookRecord:
    id: str
    title: str
    author: str | None
    source_type: str
    default_mode: str
    duration_ms: int
    audio_path: str
    hotwords_json: str | None
    provenance_json: str | None


@dataclass(frozen=True)
class LoreRecord:
    id: int
    book_id: str
    t_ms: int
    mode: str
    question: str
    answer: str
    retrieved_chunk_ids_json: str | None
    created_at: str


@dataclass(frozen=True)
class IngestJobRecord:
    id: str
    status: str
    stage: str | None
    progress_pct: int
    book_id: str | None
    error: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class ChapterRecord:
    id: int
    book_id: str
    idx: int
    title: str
    start_ms: int
    end_ms: int


def _lore_from_row(row: sqlite3.Row) -> LoreRecord:
    return LoreRecord(
        id=int(row["id"]),
        book_id=str(row["book_id"]),
        t_ms=int(row["t_ms"]),
        mode=str(row["mode"]),
        question=str(row["question"]),
        answer=str(row["answer"]),
        retrieved_chunk_ids_json=row["retrieved_chunk_ids_json"],
        created_at=str(row["created_at"]),
    )


def _book_from_row(row: sqlite3.Row) -> BookRecord:
    return BookRecord(
        id=row["id"],
        title=row["title"],
        author=row["author"],
        source_type=row["source_type"],
        default_mode=row["default_mode"],
        duration_ms=row["duration_ms"],
        audio_path=row["audio_path"],
        hotwords_json=row["hotwords_json"],
        provenance_json=row["provenance_json"],
    )


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or settings.db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=5.0, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA synchronous = NORMAL")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def init_db(db_path: Path | None = None) -> None:
    with connect(db_path) as connection:
        connection.executescript(SCHEMA_SQL)
        connection.commit()


@contextmanager
def get_connection(db_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    connection = connect(db_path)
    try:
        yield connection
    finally:
        connection.close()


def db_health(db_path: Path | None = None) -> bool:
    path = db_path or settings.db_path
    if not path.exists():
        return False
    try:
        with get_connection(path) as connection:
            connection.execute("SELECT 1").fetchone()
            row = connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='books'"
            ).fetchone()
            return row is not None
    except sqlite3.Error:
        return False


def book_count(db_path: Path | None = None) -> int:
    with get_connection(db_path) as connection:
        row = connection.execute("SELECT COUNT(*) FROM books").fetchone()
        return int(row[0]) if row else 0


def list_book_records(db_path: Path | None = None) -> list[BookRecord]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT id, title, author, source_type, default_mode, duration_ms,
                   audio_path, hotwords_json, provenance_json
            FROM books
            ORDER BY created_at ASC, id ASC
            """
        ).fetchall()
    return [_book_from_row(row) for row in rows]


def get_book(book_id: str, db_path: Path | None = None) -> BookRecord | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, title, author, source_type, default_mode, duration_ms,
                   audio_path, hotwords_json, provenance_json
            FROM books
            WHERE id = ?
            """,
            (book_id,),
        ).fetchone()
    return _book_from_row(row) if row else None


def get_chunk_rows(book_id: str, db_path: Path | None = None) -> list[sqlite3.Row]:
    with get_connection(db_path) as connection:
        return connection.execute(
            "SELECT * FROM chunks WHERE book_id = ? ORDER BY chunk_index ASC",
            (book_id,),
        ).fetchall()


def get_word_rows(
    book_id: str,
    start_ms: int | None = None,
    end_ms: int | None = None,
    db_path: Path | None = None,
) -> list[sqlite3.Row]:
    clauses = ["book_id = ?"]
    params: list[object] = [book_id]
    if start_ms is not None:
        clauses.append("start_ms >= ?")
        params.append(start_ms)
    if end_ms is not None:
        clauses.append("start_ms < ?")
        params.append(end_ms)
    with get_connection(db_path) as connection:
        return connection.execute(
            f"SELECT * FROM words WHERE {' AND '.join(clauses)} ORDER BY idx ASC",
            params,
        ).fetchall()


def get_active_chunk(book_id: str, t_ms: int, db_path: Path | None = None) -> sqlite3.Row | None:
    with get_connection(db_path) as connection:
        return connection.execute(
            """
            SELECT * FROM chunks
            WHERE book_id = ? AND start_ms <= ? AND end_ms > ?
            ORDER BY chunk_index ASC
            LIMIT 1
            """,
            (book_id, t_ms, t_ms),
        ).fetchone()


def count_chunks_after(book_id: str, t_ms: int, db_path: Path | None = None) -> int:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT COUNT(*) FROM chunks WHERE book_id = ? AND start_ms > ?",
            (book_id, t_ms),
        ).fetchone()
    return int(row[0]) if row else 0


def fts_search(
    book_id: str,
    match_query: str,
    end_ms: int | None = None,
    limit: int = 20,
    db_path: Path | None = None,
) -> list[sqlite3.Row]:
    if not match_query:
        return []
    clause = ""
    params: list[object] = [match_query, book_id]
    if end_ms is not None:
        clause = " AND c.end_ms <= ?"
        params.append(end_ms)
    params.append(limit)
    with get_connection(db_path) as connection:
        return connection.execute(
            f"""
            SELECT c.id AS chunk_id, bm25(chunks_fts) AS score
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.chunk_id
            WHERE chunks_fts MATCH ? AND c.book_id = ?{clause}
            ORDER BY score ASC, c.chunk_index ASC
            LIMIT ?
            """,
            params,
        ).fetchall()


def create_lore_entry(
    book_id: str,
    t_ms: int,
    mode: str,
    question: str,
    answer: str,
    retrieved_chunk_ids: list[str] | None = None,
    created_at: str | None = None,
    db_path: Path | None = None,
) -> LoreRecord:
    created = created_at or datetime.now(UTC).isoformat()
    chunk_json = json.dumps(retrieved_chunk_ids) if retrieved_chunk_ids else None
    with get_connection(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO lore_entries (
                book_id, t_ms, mode, question, answer, retrieved_chunk_ids_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (book_id, t_ms, mode, question, answer, chunk_json, created),
        )
        entry_id = cursor.lastrowid
        connection.commit()
        row = connection.execute(
            "SELECT * FROM lore_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
        if not row:
            raise RuntimeError("Failed to retrieve created lore entry")
        return _lore_from_row(row)


def list_lore_entries(book_id: str, db_path: Path | None = None) -> list[LoreRecord]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT * FROM lore_entries
            WHERE book_id = ?
            ORDER BY t_ms ASC, id ASC
            """,
            (book_id,),
        ).fetchall()
    return [_lore_from_row(row) for row in rows]


def delete_lore_entry(book_id: str, entry_id: int, db_path: Path | None = None) -> bool:
    with get_connection(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM lore_entries WHERE book_id = ? AND id = ?",
            (book_id, entry_id),
        )
        connection.commit()
        return cursor.rowcount > 0


def clear_lore_entries(book_id: str, db_path: Path | None = None) -> int:
    with get_connection(db_path) as connection:
        cursor = connection.execute(
            "DELETE FROM lore_entries WHERE book_id = ?",
            (book_id,),
        )
        connection.commit()
        return cursor.rowcount


def create_ingest_job(
    job_id: str,
    status: str = "queued",
    stage: str | None = None,
    progress_pct: int = 0,
    book_id: str | None = None,
    db_path: Path | None = None,
) -> IngestJobRecord:
    now = datetime.now(UTC).isoformat()
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO ingest_jobs (
              id, status, stage, progress_pct, book_id, error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (job_id, status, stage, progress_pct, book_id, now, now),
        )
        connection.commit()
    job = get_ingest_job(job_id, db_path)
    if job is None:
        raise RuntimeError("Failed to retrieve created ingest job")
    return job


def update_ingest_job(
    job_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    progress_pct: int | None = None,
    book_id: str | None = None,
    error: str | None = None,
    db_path: Path | None = None,
) -> None:
    now = datetime.now(UTC).isoformat()
    clauses = ["updated_at = ?"]
    params: list[object] = [now]
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if stage is not None:
        clauses.append("stage = ?")
        params.append(stage)
    if progress_pct is not None:
        clauses.append("progress_pct = ?")
        params.append(progress_pct)
    if book_id is not None:
        clauses.append("book_id = ?")
        params.append(book_id)
    if error is not None:
        clauses.append("error = ?")
        params.append(error)
    params.append(job_id)
    with get_connection(db_path) as connection:
        connection.execute(
            f"UPDATE ingest_jobs SET {', '.join(clauses)} WHERE id = ?",
            params,
        )
        connection.commit()


def get_ingest_job(job_id: str, db_path: Path | None = None) -> IngestJobRecord | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM ingest_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        if not row:
            return None
        return IngestJobRecord(
            id=str(row["id"]),
            status=str(row["status"]),
            stage=row["stage"],
            progress_pct=int(row["progress_pct"]),
            book_id=row["book_id"],
            error=row["error"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )


def save_chapters(
    book_id: str,
    chapters: list[dict[str, object]] | list[ChapterRecord],
    db_path: Path | None = None,
) -> None:
    with get_connection(db_path) as connection:
        connection.execute("DELETE FROM chapters WHERE book_id = ?", (book_id,))
        for idx, ch in enumerate(chapters):
            if isinstance(ch, ChapterRecord):
                title = ch.title
                start_ms = ch.start_ms
                end_ms = ch.end_ms
            else:
                title = str(ch.get("title", f"Chapter {idx + 1}"))
                start_ms = int(ch.get("start_ms", 0))  # type: ignore[arg-type]
                end_ms = int(ch.get("end_ms", 0))  # type: ignore[arg-type]
            connection.execute(
                """
                INSERT INTO chapters (book_id, idx, title, start_ms, end_ms)
                VALUES (?, ?, ?, ?, ?)
                """,
                (book_id, idx, title, start_ms, end_ms),
            )
        connection.commit()


def get_chapters(book_id: str, db_path: Path | None = None) -> list[ChapterRecord]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            "SELECT * FROM chapters WHERE book_id = ? ORDER BY idx ASC",
            (book_id,),
        ).fetchall()
        return [
            ChapterRecord(
                id=int(row["id"]),
                book_id=str(row["book_id"]),
                idx=int(row["idx"]),
                title=str(row["title"]),
                start_ms=int(row["start_ms"]),
                end_ms=int(row["end_ms"]),
            )
            for row in rows
        ]
