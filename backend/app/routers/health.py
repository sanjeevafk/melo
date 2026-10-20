from __future__ import annotations

from fastapi import APIRouter

from backend.app.config import settings
from backend.app.db import db_health
from backend.app.schemas import HealthResponse, ModelStatus

router = APIRouter(tags=["health"])


def model_statuses() -> dict[str, ModelStatus]:
    stt_ready = (settings.whisper_model_dir / "model.bin").exists()
    embeddings_ready = (settings.embedding_model_dir / "config.json").exists() and (
        settings.embedding_model_dir / "model.safetensors"
    ).exists()
    llm_ready = settings.llm_model_path.exists()
    tts_ready = settings.kokoro_model_path.exists() and settings.kokoro_voices_path.exists()
    return {
        "stt": "ready" if stt_ready else "missing",
        "embeddings": "ready" if embeddings_ready else "missing",
        "llm": "ready" if llm_ready else "missing",
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
