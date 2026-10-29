from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    res: dict[str, str] = {}
    try:
        content = path.read_text(encoding="utf-8")
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                res[k.strip()] = v.strip().strip("'\"")
    except Exception:
        pass
    return res


_DOTENV = _load_env_file(REPO_ROOT / ".env")


def _get_val(*keys: str, default: Any = None) -> Any:
    for k in keys:
        if k in os.environ:
            return os.environ[k]
    for k in keys:
        if k in _DOTENV:
            return _DOTENV[k]
    return default


def _as_str(*keys: str, default: str) -> str:
    val = _get_val(*keys, default=default)
    return str(val) if val is not None else default


def _as_int(*keys: str, default: int) -> int:
    val = _get_val(*keys, default=default)
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _as_float(*keys: str, default: float) -> float:
    val = _get_val(*keys, default=default)
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _as_bool(*keys: str, default: bool) -> bool:
    val = _get_val(*keys, default=default)
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    return str(val).lower() in ("true", "1", "yes", "on")


def _as_path(*keys: str, default: Path) -> Path:
    val = _get_val(*keys, default=default)
    if isinstance(val, Path):
        return val
    return Path(val) if val is not None else default


@dataclass
class Settings:
    profile: Literal["cpu", "gpu"] = field(
        default_factory=lambda: (
            "gpu"
            if _as_str("PROFILE", "MELO_PROFILE", "ECHOREAD_PROFILE", default="cpu").lower()
            == "gpu"
            else "cpu"
        )
    )
    host: str = field(
        default_factory=lambda: _as_str("HOST", "MELO_HOST", "ECHOREAD_HOST", default="127.0.0.1")
    )
    port: int = field(
        default_factory=lambda: _as_int("PORT", "MELO_PORT", "ECHOREAD_PORT", default=8000)
    )
    data_dir: Path = field(
        default_factory=lambda: _as_path(
            "DATA_DIR", "MELO_DATA_DIR", "ECHOREAD_DATA_DIR", default=REPO_ROOT / "data"
        )
    )

    max_upload_bytes: int = field(
        default_factory=lambda: _as_int(
            "MAX_UPLOAD_BYTES",
            "MELO_MAX_UPLOAD_BYTES",
            "ECHOREAD_MAX_UPLOAD_BYTES",
            default=50 * 1024 * 1024,
        )
    )
    max_upload_duration_ms: int = field(
        default_factory=lambda: _as_int(
            "MAX_UPLOAD_DURATION_MS",
            "MELO_MAX_UPLOAD_DURATION_MS",
            "ECHOREAD_MAX_UPLOAD_DURATION_MS",
            default=1_800_000,
        )
    )
    max_document_sentences: int = field(
        default_factory=lambda: _as_int(
            "MAX_DOCUMENT_SENTENCES",
            "MELO_MAX_DOCUMENT_SENTENCES",
            "ECHOREAD_MAX_DOCUMENT_SENTENCES",
            default=250,
        )
    )
    max_voice_bytes: int = field(
        default_factory=lambda: _as_int(
            "MAX_VOICE_BYTES",
            "MELO_MAX_VOICE_BYTES",
            "ECHOREAD_MAX_VOICE_BYTES",
            default=2 * 1024 * 1024,
        )
    )
    max_voice_duration_ms: int = field(
        default_factory=lambda: _as_int(
            "MAX_VOICE_DURATION_MS",
            "MELO_MAX_VOICE_DURATION_MS",
            "ECHOREAD_MAX_VOICE_DURATION_MS",
            default=15_000,
        )
    )

    cors_origins: list[str] = field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    test_mode: bool = field(
        default_factory=lambda: _as_bool(
            "TEST_MODE", "MELO_TEST_MODE", "ECHOREAD_TEST_MODE", default=False
        )
    )
    demo_cache: bool = field(
        default_factory=lambda: _as_bool(
            "DEMO_CACHE", "MELO_DEMO_CACHE", "ECHOREAD_DEMO_CACHE", default=False
        )
    )

    stt_provider: Literal["phonon", "whisper"] = field(
        default_factory=lambda: (
            "whisper"
            if _as_str(
                "STT_PROVIDER", "MELO_STT_PROVIDER", "ECHOREAD_STT_PROVIDER", default="phonon"
            ).lower()
            == "whisper"
            else "phonon"
        )
    )
    phonon_model: str = field(
        default_factory=lambda: _as_str(
            "PHONON_MODEL", "MELO_PHONON_MODEL", "ECHOREAD_PHONON_MODEL", default="phonon-2.5"
        )
    )

    batch_stt_provider: Literal["local", "qwen3_asr"] = field(
        default_factory=lambda: (
            "qwen3_asr"
            if _as_str(
                "BATCH_STT_PROVIDER",
                "MELO_BATCH_STT_PROVIDER",
                "ECHOREAD_BATCH_STT_PROVIDER",
                default="local",
            ).lower()
            == "qwen3_asr"
            else "local"
        )
    )
    qwen3_asr_endpoint: str = field(
        default_factory=lambda: _as_str(
            "QWEN3_ASR_ENDPOINT",
            "MELO_QWEN3_ASR_ENDPOINT",
            "ECHOREAD_QWEN3_ASR_ENDPOINT",
            "BATCH_STT_ENDPOINT",
            "MELO_BATCH_STT_ENDPOINT",
            default="http://localhost:8000/v1",
        )
    )
    qwen3_asr_api_key: str = field(
        default_factory=lambda: _as_str(
            "QWEN3_ASR_API_KEY",
            "MELO_QWEN3_ASR_API_KEY",
            "ECHOREAD_QWEN3_ASR_API_KEY",
            "BATCH_STT_API_KEY",
            "MELO_BATCH_STT_API_KEY",
            default="",
        )
    )
    qwen3_asr_model: str = field(
        default_factory=lambda: _as_str(
            "QWEN3_ASR_MODEL",
            "MELO_QWEN3_ASR_MODEL",
            "ECHOREAD_QWEN3_ASR_MODEL",
            "BATCH_STT_MODEL",
            "MELO_BATCH_STT_MODEL",
            default="Qwen/Qwen3-ASR-1.7B",
        )
    )
    qwen3_asr_timeout_seconds: float = field(
        default_factory=lambda: _as_float(
            "QWEN3_ASR_TIMEOUT",
            "MELO_QWEN3_ASR_TIMEOUT",
            "ECHOREAD_QWEN3_ASR_TIMEOUT",
            "BATCH_STT_TIMEOUT",
            "MELO_BATCH_STT_TIMEOUT",
            default=300.0,
        )
    )

    llm_provider: Literal["ollama", "openai", "llama_cpp"] = field(
        default_factory=lambda: _as_str(
            "LLM_PROVIDER", "MELO_LLM_PROVIDER", "ECHOREAD_LLM_PROVIDER", default="ollama"
        )  # type: ignore[assignment]
    )
    llm_endpoint: str = field(
        default_factory=lambda: _as_str(
            "LLM_ENDPOINT",
            "MELO_LLM_ENDPOINT",
            "ECHOREAD_LLM_ENDPOINT",
            "OLLAMA_HOST",
            "OLLAMA_BASE_URL",
            default="http://localhost:11434",
        )
    )
    llm_api_key: str = field(
        default_factory=lambda: _as_str(
            "LLM_API_KEY", "MELO_LLM_API_KEY", "ECHOREAD_LLM_API_KEY", default=""
        )
    )
    llm_model: str = field(
        default_factory=lambda: _as_str(
            "LLM_MODEL", "MELO_LLM_MODEL", "ECHOREAD_LLM_MODEL", default="gemma4:e2b"
        )
    )
    llm_think: bool = field(
        default_factory=lambda: _as_bool(
            "LLM_THINK", "MELO_LLM_THINK", "ECHOREAD_LLM_THINK", default=False
        )
    )
    llm_timeout_seconds: float = field(
        default_factory=lambda: _as_float(
            "LLM_TIMEOUT", "MELO_LLM_TIMEOUT", "ECHOREAD_LLM_TIMEOUT", default=60.0
        )
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
