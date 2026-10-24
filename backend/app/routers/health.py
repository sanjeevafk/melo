from __future__ import annotations

from fastapi import APIRouter

from backend.app.config import settings
from backend.app.db import db_health
from backend.app.schemas import HealthResponse, ModelStatus
from backend.app.services.llm import llm_ready
from backend.app.services.stt import stt_ready

router = APIRouter(tags=["health"])


def model_statuses() -> dict[str, ModelStatus]:
    stt_is_ready = stt_ready()
    embeddings_ready = (settings.embedding_model_dir / "config.json").exists() and (
        settings.embedding_model_dir / "model.safetensors"
    ).exists()
    llm_is_ready = llm_ready()
    tts_ready = settings.kokoro_model_path.exists() and settings.kokoro_voices_path.exists()
    return {
        "stt": "ready" if stt_is_ready else "missing",
        "embeddings": "ready" if embeddings_ready else "missing",
        "llm": "ready" if llm_is_ready else "missing",
        "tts": "ready" if tts_ready else "missing",
    }


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    models = model_statuses()
    database_ready = db_health()
    models_ready = all(status == "ready" for status in models.values())
    return HealthResponse(
        ready=settings.test_mode or (models_ready and database_ready),
        profile=settings.profile,
        models=models,
        db="ready" if database_ready else "error",
    )
