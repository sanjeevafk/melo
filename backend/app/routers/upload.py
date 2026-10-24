from __future__ import annotations

import concurrent.futures
import shutil
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, File, Form, Query, UploadFile

from backend.app import db
from backend.app.config import settings
from backend.app.errors import ApiError
from backend.app.routers.books import build_manifest
from backend.app.schemas import BookManifest, IngestJobStatus
from backend.app.services.audio import (
    DOCUMENT_EXTENSIONS,
    AudioValidationError,
    convert_to_browser_audio,
    detect_upload_suffix,
    probe_audio,
    validate_upload,
)
from backend.app.services.document import parse_document, synthesize_document
from backend.app.services.ingest import WordTimingInput, ingest_book

router = APIRouter(prefix="/api", tags=["upload"])

CHUNK_SIZE = 1024 * 1024
_upload_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)


def _process_ingestion(
    job_id: str,
    book_id: str,
    raw_path: Path,
    title: str,
    mode: Literal["story", "study"],
    suffix: str,
) -> None:
    book_dir = raw_path.parent
    try:
        if suffix in DOCUMENT_EXTENSIONS:
            db.update_ingest_job(
                job_id,
                status="synthesizing",
                stage="Parsing document…",
                progress_pct=15,
            )
            doc = parse_document(raw_path, fallback_title=title)
            final_title = doc.title or title or "Uploaded document"
            audio_destination = book_dir / "audio.mp3"

            def _progress_callback(pct: int, msg: str) -> None:
                db.update_ingest_job(job_id, stage=msg, progress_pct=pct)

            duration_ms, words, chapters = synthesize_document(
                doc,
                audio_destination,
                voice="af_heart",
                on_progress=_progress_callback,
            )

            db.update_ingest_job(
                job_id,
                status="chunking",
                stage="Building search chunks…",
                progress_pct=75,
            )

            timing_inputs = [
                WordTimingInput(
                    word=str(w["word"]),
                    start_ms=int(w["start_ms"]),  # type: ignore[arg-type]
                    end_ms=int(w["end_ms"]),  # type: ignore[arg-type]
                )
                for w in words
            ]

            ingest_book(
                book_id=book_id,
                title=final_title,
                author=doc.author,
                audio_path=audio_destination,
                duration_ms=duration_ms,
                source_text="",
                source_type="audio_upload",
                default_mode=mode,
                words=timing_inputs,
                chapters=chapters,
                provenance={
                    "source": "document_upload",
                    "license": "user_provided",
                },
            )

        else:
            # Audio upload (.mp3, .webm, .m4a, .m4b)
            db.update_ingest_job(
                job_id,
                status="transcribing",
                stage="Inspecting audio metadata…",
                progress_pct=15,
            )
            audio_info = probe_audio(raw_path)
            chapters = audio_info.chapters

            # For .m4b or non-standard container formats, convert/remux to mp3
            if suffix.lower() == ".m4b":
                playable_audio = book_dir / "audio.mp3"
                convert_to_browser_audio(raw_path, playable_audio)
            else:
                playable_audio = raw_path

            db.update_ingest_job(
                job_id,
                status="transcribing",
                stage="Transcribing audio with Whisper…",
                progress_pct=30,
            )

            final_title = title.strip() or "Uploaded audio"
            ingest_book(
                book_id=book_id,
                title=final_title,
                author=None,
                audio_path=playable_audio,
                duration_ms=audio_info.duration_ms,
                source_text="",
                source_type="audio_upload",
                default_mode=mode,
                chapters=chapters,
                provenance={
                    "source": "user_upload",
                    "license": "user_provided",
                },
            )

        db.update_ingest_job(
            job_id,
            status="completed",
            stage="Ready",
            progress_pct=100,
            book_id=book_id,
        )
    except Exception as exc:
        db.update_ingest_job(
            job_id,
            status="failed",
            stage="Failed",
            error=str(exc),
        )


@router.post("/upload", response_model=BookManifest | IngestJobStatus)
def upload_audio(
    audio: UploadFile = File(...),
    title: str | None = Form(default=None, max_length=200),
    mode: Literal["story", "study"] = Form(default="story"),
    sync: bool = Query(default=False),
) -> BookManifest | IngestJobStatus:
    content_type = audio.content_type
    filename = audio.filename or ""
    suffix = detect_upload_suffix(filename, content_type)
    if suffix is None:
        raise ApiError(
            400,
            "unsupported_format",
            "Use MP3, WebM, M4A, M4B, EPUB, PDF, or TXT for uploads",
        )

    book_id = uuid4().hex
    job_id = uuid4().hex
    book_dir = settings.books_dir / book_id
    book_dir.mkdir(parents=True, exist_ok=False)
    destination = book_dir / f"upload{suffix}"
    size = 0

    try:
        with destination.open("wb") as output:
            while chunk := audio.file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise ApiError(
                        413,
                        "upload_too_large",
                        f"Upload exceeds {settings.max_upload_bytes // 1024 // 1024} MB",
                    )
                output.write(chunk)
        if size == 0:
            raise ApiError(400, "mic_empty", "The uploaded file is empty")

        validate_upload(
            destination,
            content_type,
            size,
            settings.max_upload_bytes,
            settings.max_upload_duration_ms,
            suffix=suffix,
        )
    except ApiError:
        shutil.rmtree(book_dir, ignore_errors=True)
        raise
    except AudioValidationError as exc:
        shutil.rmtree(book_dir, ignore_errors=True)
        raise ApiError(400, exc.code, exc.message) from exc
    except Exception as exc:
        shutil.rmtree(book_dir, ignore_errors=True)
        raise ApiError(500, "upload_failed", str(exc)) from exc

    title_clean = (title or "").strip() or Path(filename).stem or "Uploaded title"
    db.create_ingest_job(
        job_id=job_id,
        status="queued",
        stage="Queued for processing",
        progress_pct=5,
        book_id=book_id,
    )

    future = _upload_executor.submit(
        _process_ingestion,
        job_id,
        book_id,
        destination,
        title_clean,
        mode,
        suffix,
    )

    if sync:
        future.result()
        job = db.get_ingest_job(job_id)
        if job and job.status == "failed":
            raise ApiError(500, "upload_failed", job.error or "Ingestion failed")
        book = db.get_book(book_id)
        if book is None:
            raise ApiError(500, "upload_failed", "Uploaded book could not be loaded")
        return build_manifest(book)

    return IngestJobStatus(
        id=job_id,
        status="queued",
        stage="Queued for processing",
        progress_pct=5,
        book_id=book_id,
    )


@router.get("/jobs/{job_id}", response_model=IngestJobStatus)
def get_job_status(job_id: str) -> IngestJobStatus:
    job = db.get_ingest_job(job_id)
    if job is None:
        raise ApiError(404, "job_not_found", f"Job not found: {job_id}")

    manifest = None
    if job.status == "completed" and job.book_id:
        book = db.get_book(job.book_id)
        if book:
            manifest = build_manifest(book)

    return IngestJobStatus(
        id=job.id,
        status=job.status,  # type: ignore[arg-type]
        stage=job.stage,
        progress_pct=job.progress_pct,
        book_id=job.book_id,
        error=job.error,
        manifest=manifest,
    )
