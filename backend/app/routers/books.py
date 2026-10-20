from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query

from backend.app import db
from backend.app.errors import ApiError
from backend.app.schemas import (
    BookManifest,
    BookSummary,
    ChapterMeta,
    ChunkMeta,
    ContextPreview,
    CreateLoreRequest,
    LoreEntry,
    Mode,
    Provenance,
    WordTiming,
)
from backend.app.services.retrieval import build_context

router = APIRouter(prefix="/api/books", tags=["books"])


def _book_or_404(book_id: str) -> db.BookRecord:
    book = db.get_book(book_id)
    if book is None:
        raise ApiError(404, "book_not_found", f"Book not found: {book_id}")
    return book


def _provenance(book: db.BookRecord) -> Provenance | None:
    if not book.provenance_json:
        return None
    try:
        return Provenance.model_validate(json.loads(book.provenance_json))
    except (ValueError, TypeError):
        return None


@router.get("", response_model=list[BookSummary])
def list_books() -> list[BookSummary]:
    return [
        BookSummary(
            id=book.id,
            title=book.title,
            author=book.author,
            duration_ms=book.duration_ms,
            default_mode=book.default_mode,
        )
        for book in db.list_book_records()
    ]


def build_manifest(book: db.BookRecord) -> BookManifest:
    chunk_rows = db.get_chunk_rows(book.id)
    word_rows = db.get_word_rows(book.id)
    chapter_rows = db.get_chapters(book.id)
    audio_name = Path(book.audio_path).name
    return BookManifest(
        id=book.id,
        title=book.title,
        author=book.author,
        default_mode=book.default_mode,
        duration_ms=book.duration_ms,
        audio_url=f"/media/books/{book.id}/{audio_name}",
        provenance=_provenance(book),
        chapters=[
            ChapterMeta(
                id=row.id,
                title=row.title,
                start_ms=row.start_ms,
                end_ms=row.end_ms,
            )
            for row in chapter_rows
        ],
        chunks=[
            ChunkMeta(
                id=row["id"],
                chapter=row["chapter"],
                start_ms=row["start_ms"],
                end_ms=row["end_ms"],
                text=row["text"],
            )
            for row in chunk_rows
        ],
        words=[
            WordTiming(
                word=row["word"],
                start_ms=row["start_ms"],
                end_ms=row["end_ms"],
                chunk_id=row["chunk_id"],
            )
            for row in word_rows
        ],
    )


@router.get("/{book_id}", response_model=BookManifest)
def get_book(book_id: str) -> BookManifest:
    return build_manifest(_book_or_404(book_id))


@router.get("/{book_id}/context", response_model=ContextPreview)
def get_context(
    book_id: str,
    t_ms: float = Query(default=0, ge=0),
    mode: Mode | None = None,
    query: str = Query(default="", max_length=500),
) -> ContextPreview:
    book = _book_or_404(book_id)
    return build_context(
        book=book,
        t_ms=int(round(t_ms)),
        mode=mode or book.default_mode,
        question=query,
    ).preview


def _lore_to_api(record: db.LoreRecord) -> LoreEntry:
    chunk_ids: list[str] = []
    if record.retrieved_chunk_ids_json:
        try:
            chunk_ids = json.loads(record.retrieved_chunk_ids_json)
        except (ValueError, TypeError):
            chunk_ids = []
    return LoreEntry(
        id=record.id,
        book_id=record.book_id,
        t_ms=record.t_ms,
        mode=record.mode,  # type: ignore[arg-type]
        question=record.question,
        answer=record.answer,
        retrieved_chunk_ids=chunk_ids,
        created_at=record.created_at,
    )


@router.get("/{book_id}/lore", response_model=list[LoreEntry])
def get_book_lore(book_id: str) -> list[LoreEntry]:
    _book_or_404(book_id)
    return [_lore_to_api(rec) for rec in db.list_lore_entries(book_id)]


@router.post("/{book_id}/lore", response_model=LoreEntry)
def create_book_lore(book_id: str, request: CreateLoreRequest) -> LoreEntry:
    _book_or_404(book_id)
    created = db.create_lore_entry(
        book_id=book_id,
        t_ms=request.t_ms,
        mode=request.mode,
        question=request.question,
        answer=request.answer,
        retrieved_chunk_ids=request.retrieved_chunk_ids,
    )
    return _lore_to_api(created)


@router.delete("/{book_id}/lore")
def clear_book_lore(book_id: str) -> dict[str, int]:
    _book_or_404(book_id)
    count = db.clear_lore_entries(book_id)
    return {"cleared": count}


@router.delete("/{book_id}/lore/{entry_id}")
def delete_single_lore(book_id: str, entry_id: int) -> dict[str, bool]:
    _book_or_404(book_id)
    deleted = db.delete_lore_entry(book_id, entry_id)
    if not deleted:
        raise ApiError(404, "not_found", f"Lore entry {entry_id} not found")
    return {"deleted": True}
