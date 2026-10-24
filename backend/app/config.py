from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MELO_",
        env_file=REPO_ROOT / ".env",
        extra="ignore",
    )

    profile: Literal["cpu", "gpu"] = Field(
        default="cpu",
        validation_alias=AliasChoices("PROFILE", "MELO_PROFILE", "ECHOREAD_PROFILE"),
    )
    host: str = Field(
        default="127.0.0.1",
        validation_alias=AliasChoices("HOST", "MELO_HOST", "ECHOREAD_HOST"),
    )
    port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "MELO_PORT", "ECHOREAD_PORT"),
    )
    data_dir: Path = Field(
        default=REPO_ROOT / "data",
        validation_alias=AliasChoices("DATA_DIR", "MELO_DATA_DIR", "ECHOREAD_DATA_DIR"),
    )

    max_upload_bytes: int = Field(
        default=50 * 1024 * 1024,
        validation_alias=AliasChoices(
            "MAX_UPLOAD_BYTES", "MELO_MAX_UPLOAD_BYTES", "ECHOREAD_MAX_UPLOAD_BYTES"
        ),
    )
    max_upload_duration_ms: int = Field(
        default=1_800_000,
        validation_alias=AliasChoices(
            "MAX_UPLOAD_DURATION_MS",
            "MELO_MAX_UPLOAD_DURATION_MS",
            "ECHOREAD_MAX_UPLOAD_DURATION_MS",
        ),
    )
    max_document_sentences: int = Field(
        default=250,
        validation_alias=AliasChoices(
            "MAX_DOCUMENT_SENTENCES",
            "MELO_MAX_DOCUMENT_SENTENCES",
            "ECHOREAD_MAX_DOCUMENT_SENTENCES",
        ),
    )
    max_voice_bytes: int = Field(
        default=2 * 1024 * 1024,
        validation_alias=AliasChoices(
            "MAX_VOICE_BYTES", "MELO_MAX_VOICE_BYTES", "ECHOREAD_MAX_VOICE_BYTES"
        ),
    )
    max_voice_duration_ms: int = Field(
        default=15_000,
        validation_alias=AliasChoices(
            "MAX_VOICE_DURATION_MS",
            "MELO_MAX_VOICE_DURATION_MS",
            "ECHOREAD_MAX_VOICE_DURATION_MS",
        ),
    )

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    test_mode: bool = Field(
        default=False,
        validation_alias=AliasChoices("TEST_MODE", "MELO_TEST_MODE", "ECHOREAD_TEST_MODE"),
    )
    demo_cache: bool = Field(
        default=False,
        validation_alias=AliasChoices("DEMO_CACHE", "MELO_DEMO_CACHE", "ECHOREAD_DEMO_CACHE"),
    )

    stt_provider: Literal["phonon", "whisper"] = Field(
        default="phonon",
        validation_alias=AliasChoices("STT_PROVIDER", "MELO_STT_PROVIDER", "ECHOREAD_STT_PROVIDER"),
    )
    phonon_model: str = Field(
        default="phonon-2.5",
        validation_alias=AliasChoices("PHONON_MODEL", "MELO_PHONON_MODEL", "ECHOREAD_PHONON_MODEL"),
    )

    llm_provider: Literal["ollama", "openai", "llama_cpp"] = Field(
        default="ollama",
        validation_alias=AliasChoices("LLM_PROVIDER", "MELO_LLM_PROVIDER", "ECHOREAD_LLM_PROVIDER"),
    )
    llm_endpoint: str = Field(
        default="http://100.127.242.86:11434",
        validation_alias=AliasChoices(
            "LLM_ENDPOINT",
            "MELO_LLM_ENDPOINT",
            "ECHOREAD_LLM_ENDPOINT",
            "OLLAMA_HOST",
            "OLLAMA_BASE_URL",
        ),
    )
    llm_model: str = Field(
        default="gemma4:e2b",
        validation_alias=AliasChoices("LLM_MODEL", "MELO_LLM_MODEL", "ECHOREAD_LLM_MODEL"),
    )
    llm_think: bool = Field(
        default=False,
        validation_alias=AliasChoices("LLM_THINK", "MELO_LLM_THINK", "ECHOREAD_LLM_THINK"),
    )
    llm_timeout_seconds: float = Field(
        default=60.0,
        validation_alias=AliasChoices("LLM_TIMEOUT", "MELO_LLM_TIMEOUT", "ECHOREAD_LLM_TIMEOUT"),
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
        melo_db = self.data_dir / "melo.db"
        if not melo_db.exists():
            echoread_db = self.data_dir / "echoread.db"
            if echoread_db.exists():
                return echoread_db
        return melo_db

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
        gemma_gguf = self.models_dir / "gemma-2-2b-it-q4_k_m.gguf"
        if gemma_gguf.exists():
            return gemma_gguf
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
