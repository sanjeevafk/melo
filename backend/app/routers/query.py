from __future__ import annotations

import time

from fastapi import APIRouter

from backend.app import db
from backend.app.errors import ApiError
from backend.app.prompts import STORY_REFUSAL, finalize_answer, should_refuse_story
from backend.app.schemas import QueryRequest, QueryResponse
from backend.app.services.embeddings import EmbeddingUnavailable
from backend.app.services.llm import LLMUnavailable, get_llm
from backend.app.services.retrieval import build_context

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
def query(request: QueryRequest) -> QueryResponse:
    started = time.perf_counter()
    book = db.get_book(request.book_id)
    if book is None:
        raise ApiError(404, "book_not_found", f"Book not found: {request.book_id}")

    history = [(turn.question, turn.answer) for turn in request.history]
    try:
        result = build_context(
            book=book,
            t_ms=request.t_ms,
            mode=request.mode,
            question=request.question,
            recent_turns=history,
        )
    except EmbeddingUnavailable as exc:
        raise ApiError(503, "not_ready", str(exc)) from exc
    retrieval_ms = int((time.perf_counter() - started) * 1000)

    if request.mode == "story" and should_refuse_story(
        result.preview.immediate_text,
        result.preview.retrieved,
        request.question,
    ):
        db.create_lore_entry(
            book_id=request.book_id,
            t_ms=request.t_ms,
            mode=request.mode,
            question=request.question,
            answer=STORY_REFUSAL,
            retrieved_chunk_ids=[c.chunk_id for c in result.preview.retrieved],
        )
        return QueryResponse(
            answer=STORY_REFUSAL,
            context=result.preview,
            timings={
                "retrieval_ms": retrieval_ms,
                "llm_first_token_ms": 0,
                "total_ms": retrieval_ms,
            },
        )

    llm_started = time.perf_counter()
    try:
        raw_answer = get_llm().complete(result.prompt)
    except LLMUnavailable as exc:
        raise ApiError(503, "not_ready", str(exc)) from exc
    except Exception as exc:
        raise ApiError(500, "llm_failed", str(exc)) from exc
    llm_ms = int((time.perf_counter() - llm_started) * 1000)
    total_ms = int((time.perf_counter() - started) * 1000)
    answer = finalize_answer(raw_answer, request.mode)

    db.create_lore_entry(
        book_id=request.book_id,
        t_ms=request.t_ms,
        mode=request.mode,
        question=request.question,
        answer=answer,
        retrieved_chunk_ids=[c.chunk_id for c in result.preview.retrieved],
    )

    return QueryResponse(
        answer=answer,
        context=result.preview,
        timings={
            "retrieval_ms": retrieval_ms,
            "llm_first_token_ms": llm_ms,
            "total_ms": total_ms,
        },
    )
