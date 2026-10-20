from __future__ import annotations

import base64
import concurrent.futures
import json
import os
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from backend.app import db
from backend.app.config import settings
from backend.app.errors import ApiError
from backend.app.prompts import (
    STORY_REFUSAL,
    finalize_answer,
    should_refuse_story,
    split_sentences,
    strip_spoken_preamble,
    take_first_tts_chunk,
)
from backend.app.schemas import HistoryTurn, Mode
from backend.app.services.audio import AudioValidationError, validate_voice_clip
from backend.app.services.embeddings import EmbeddingUnavailable
from backend.app.services.llm import LLMUnavailable, get_llm
from backend.app.services.retrieval import build_context
from backend.app.services.stt import STTUnavailable, get_stt
from backend.app.services.tts import TTSUnavailable, get_tts

router = APIRouter(prefix="/api", tags=["voice"])

CHUNK_SIZE = 1024 * 1024
SAMPLE_RATE = 24_000


def _event(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def _parse_history(raw: str | None) -> list[HistoryTurn]:
    if not raw:
        return []
    try:
        payload = json.loads(raw)
        turns = [HistoryTurn.model_validate(item) for item in payload]
    except (ValueError, TypeError, ValidationError) as exc:
        raise ApiError(
            400,
            "invalid_history",
            "History must be a JSON array of question/answer turns",
        ) from exc
    if len(turns) > 2:
        raise ApiError(400, "invalid_history", "At most two history turns are allowed")
    return turns


def _complete_sentences(buffer: str) -> tuple[list[str], str]:
    sentences = split_sentences(buffer)
    if len(sentences) <= 1:
        return [], buffer
    return sentences[:-1], sentences[-1]


def _audio_event(
    tts: Any,
    sentence: str,
    seq: int,
) -> tuple[dict[str, object], int]:
    synthesis_started = time.perf_counter()
    wav = tts.wav_bytes(sentence, voice="af_heart")
    elapsed = int((time.perf_counter() - synthesis_started) * 1000)
    return (
        {
            "type": "audio",
            "seq": seq,
            "text": sentence,
            "wav_b64": base64.b64encode(wav).decode("ascii"),
            "sample_rate": SAMPLE_RATE,
        },
        elapsed,
    )


def _voice_events(
    book: db.BookRecord,
    audio_path: Path,
    t_ms: int,
    mode: Mode,
    history: list[HistoryTurn],
) -> Iterator[str]:
    started = time.perf_counter()
    stt_ms = 0
    retrieval_ms = 0
    llm_first_token_ms = 0
    tts_first_sentence_ms = 0
    audio_seq = 0
    first_audio = True

    try:
        yield _event({"type": "status", "stage": "transcribing"})
        try:
            transcript, _ = get_stt().transcribe(audio_path, hotwords=None, word_timestamps=False)
        except STTUnavailable as exc:
            yield _event({"type": "error", "code": "not_ready", "message": str(exc)})
            yield _event({"type": "done"})
            return
        except Exception as exc:
            yield _event({"type": "error", "code": "stt_failed", "message": str(exc)})
            yield _event({"type": "done"})
            return
        stt_ms = int((time.perf_counter() - started) * 1000)
        if not transcript.strip():
            yield _event(
                {"type": "error", "code": "mic_empty", "message": "I did not catch any speech"}
            )
            yield _event({"type": "done"})
            return
        yield _event({"type": "transcript", "text": transcript})

        retrieval_started = time.perf_counter()
        try:
            context = build_context(
                book=book,
                t_ms=t_ms,
                mode=mode,
                question=transcript,
                recent_turns=[(turn.question, turn.answer) for turn in history],
            )
        except EmbeddingUnavailable as exc:
            yield _event({"type": "error", "code": "not_ready", "message": str(exc)})
            yield _event({"type": "done"})
            return
        retrieval_ms = int((time.perf_counter() - retrieval_started) * 1000)
        preview = context.preview.model_dump(mode="json")
        preview["type"] = "context"
        yield _event(preview)

        try:
            tts = get_tts()
        except TTSUnavailable as exc:
            yield _event({"type": "error", "code": "tts_failed", "message": str(exc)})
            tts = None
        except Exception as exc:
            yield _event({"type": "error", "code": "tts_failed", "message": str(exc)})
            tts = None

        fast_refusal = mode == "story" and should_refuse_story(
            context.preview.immediate_text,
            context.preview.retrieved,
            transcript,
        )
        sentence_buffer = ""

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending_audio: list[concurrent.futures.Future[tuple[dict[str, object], int]]] = []

            def _drain_ready_audio() -> Iterator[str]:
                nonlocal first_audio, tts_first_sentence_ms, tts
                while pending_audio and pending_audio[0].done():
                    future = pending_audio.pop(0)
                    try:
                        event, elapsed = future.result()
                    except Exception as exc:
                        yield _event({"type": "error", "code": "tts_failed", "message": str(exc)})
                        tts = None
                        break
                    if first_audio:
                        tts_first_sentence_ms = elapsed
                        first_audio = False
                    yield _event(event)

            if fast_refusal:
                answer = STORY_REFUSAL
                sentence_buffer = answer
                db.create_lore_entry(
                    book_id=book.id,
                    t_ms=t_ms,
                    mode=mode,
                    question=transcript,
                    answer=answer,
                    retrieved_chunk_ids=[c.chunk_id for c in context.preview.retrieved],
                )
                yield _event({"type": "answer_delta", "text": answer})
                yield _event({"type": "answer", "text": answer})
            else:
                yield _event({"type": "status", "stage": "thinking"})
                try:
                    llm = get_llm()
                except LLMUnavailable as exc:
                    yield _event({"type": "error", "code": "not_ready", "message": str(exc)})
                    yield _event({"type": "done"})
                    return
                except Exception as exc:
                    yield _event({"type": "error", "code": "llm_failed", "message": str(exc)})
                    yield _event({"type": "done"})
                    return

                llm_started = time.perf_counter()
                accumulated: list[str] = []
                first_token_seen = False
                try:
                    for delta in llm.stream(context.prompt):
                        if not first_token_seen:
                            llm_first_token_ms = int((time.perf_counter() - llm_started) * 1000)
                            first_token_seen = True
                        accumulated.append(delta)
                        yield _event({"type": "answer_delta", "text": delta})
                        sentence_buffer += delta
                        if first_audio and tts is not None and sentence_buffer.strip():
                            spoken = strip_spoken_preamble(sentence_buffer)
                            chunk, sentence_buffer = take_first_tts_chunk(spoken)
                            if chunk:
                                try:
                                    event, elapsed = _audio_event(tts, chunk, audio_seq)
                                except Exception as exc:
                                    yield _event(
                                        {"type": "error", "code": "tts_failed", "message": str(exc)}
                                    )
                                    tts = None
                                else:
                                    tts_first_sentence_ms = elapsed
                                    first_audio = False
                                    yield _event(event)
                                    audio_seq += 1
                        completed, sentence_buffer = _complete_sentences(sentence_buffer)
                        for sentence in completed:
                            if tts is None or not sentence.strip():
                                continue
                            pending_audio.append(
                                pool.submit(_audio_event, tts, sentence, audio_seq)
                            )
                            audio_seq += 1
                        yield from _drain_ready_audio()
                    answer = finalize_answer("".join(accumulated), mode)
                except Exception as exc:
                    yield _event({"type": "error", "code": "llm_failed", "message": str(exc)})
                    yield _event({"type": "done"})
                    return
                yield _event({"type": "answer", "text": answer})
                db.create_lore_entry(
                    book_id=book.id,
                    t_ms=t_ms,
                    mode=mode,
                    question=transcript,
                    answer=answer,
                    retrieved_chunk_ids=[c.chunk_id for c in context.preview.retrieved],
                )

            if tts is not None and sentence_buffer.strip():
                for sentence in split_sentences(sentence_buffer):
                    if not sentence.strip():
                        continue
                    pending_audio.append(pool.submit(_audio_event, tts, sentence, audio_seq))
                    audio_seq += 1

            while pending_audio:
                future = pending_audio.pop(0)
                try:
                    event, elapsed = future.result()
                except Exception as exc:
                    yield _event({"type": "error", "code": "tts_failed", "message": str(exc)})
                    tts = None
                    break
                if first_audio:
                    tts_first_sentence_ms = elapsed
                    first_audio = False
                yield _event(event)

        timings = {
            "stt_ms": stt_ms,
            "retrieval_ms": retrieval_ms,
            "llm_first_token_ms": llm_first_token_ms,
            "tts_first_sentence_ms": tts_first_sentence_ms,
        }
        timings["total_ms"] = sum(timings.values())
        yield _event({"type": "timings", **timings})
        yield _event({"type": "done"})
    finally:
        audio_path.unlink(missing_ok=True)


@router.post("/voice-query")
def voice_query(
    audio: UploadFile = File(...),
    book_id: str = Form(...),
    t_ms: int = Form(...),
    mode: Mode = Form(...),
    history: str | None = Form(default=None),
) -> StreamingResponse:
    book = db.get_book(book_id)
    if book is None:
        raise ApiError(404, "book_not_found", f"Book not found: {book_id}")
    if t_ms < 0:
        raise ApiError(400, "invalid_t_ms", "t_ms must be non-negative")
    turns = _parse_history(history)

    suffix = Path(audio.filename or "clip.wav").suffix or ".wav"
    if audio.content_type == "audio/wav" and suffix.lower() != ".wav":
        suffix = ".wav"
    descriptor, name = tempfile.mkstemp(prefix="echoread-voice-", suffix=suffix)
    path = Path(name)
    size = 0
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            while chunk := audio.file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > settings.max_voice_bytes:
                    raise AudioValidationError("clip_too_large", "Voice clip exceeds 2 MB")
                temporary.write(chunk)
        if size == 0:
            raise AudioValidationError("mic_empty", "No audio was recorded")
        validate_voice_clip(
            path,
            audio.content_type,
            size,
            settings.max_voice_bytes,
            settings.max_voice_duration_ms,
        )
    except AudioValidationError as exc:
        path.unlink(missing_ok=True)
        status = 413 if exc.code == "clip_too_large" else 400
        raise ApiError(status, exc.code, exc.message) from exc
    except Exception:
        path.unlink(missing_ok=True)
        raise

    return StreamingResponse(
        _voice_events(book, path, t_ms, mode, turns),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
