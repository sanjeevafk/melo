from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ECHOREAD_",
        env_file=REPO_ROOT / ".env",
        extra="ignore",
    )

    profile: Literal["cpu", "gpu"] = "cpu"
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = REPO_ROOT / "data"

    max_upload_bytes: int = 50 * 1024 * 1024
    max_upload_duration_ms: int = 1_800_000
    max_voice_bytes: int = 2 * 1024 * 1024
    max_voice_duration_ms: int = 15_000

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    test_mode: bool = Field(
        default=False,
        validation_alias=AliasChoices("TEST_MODE", "ECHOREAD_TEST_MODE"),
    )
    demo_cache: bool = Field(
        default=False,
        validation_alias=AliasChoices("DEMO_CACHE", "ECHOREAD_DEMO_CACHE"),
    )

    @property
    def is_gpu(self) -> bool:
        return self.profile == "gpu"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def books_dir(self) -> Path:
        return self.data_dir / "books"

    @property
    def demo_cache_dir(self) -> Path:
        return self.data_dir / "demo_cache"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "echoread.db"

    @property
    def model_manifest_path(self) -> Path:
        return self.models_dir / "manifest.json"

    @property
    def whisper_model_dir(self) -> Path:
        name = "faster-whisper-small.en" if self.is_gpu else "faster-whisper-base.en"
        return self.models_dir / name

    @property
    def embedding_model_dir(self) -> Path:
        return self.models_dir / "embeddinggemma-2"

    @property
    def llm_model_path(self) -> Path:
        name = (
            "qwen2.5-3b-instruct-q4_k_m.gguf"
            if self.is_gpu
            else "qwen2.5-1.5b-instruct-q4_k_m.gguf"
        )
        return self.models_dir / name

    @property
    def kokoro_model_path(self) -> Path:
        return self.models_dir / "kokoro-v1.0.int8.onnx"

    @property
    def kokoro_voices_path(self) -> Path:
        return self.models_dir / "voices-v1.0.bin"

    @property
    def embedding_dtype(self) -> str:
        return "bfloat16" if self.is_gpu else "float32"

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.books_dir.mkdir(parents=True, exist_ok=True)
        self.demo_cache_dir.mkdir(parents=True, exist_ok=True)

    def book_dir(self, book_id: str) -> Path:
        return self.books_dir / book_id


settings = Settings()
