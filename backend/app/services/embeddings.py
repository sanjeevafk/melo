from __future__ import annotations

import threading
from functools import lru_cache
from pathlib import Path

import numpy as np

from backend.app.config import settings

EMBEDDING_DIM = 256
DOCUMENT_PROMPT = "Document"
QUERY_PROMPT = "SearchQuery"


class EmbeddingUnavailable(RuntimeError):
    pass


class EmbeddingModel:
    def __init__(self, model_path: Path, device: str, dtype: str) -> None:
        import torch
        from sentence_transformers import SentenceTransformer

        self._lock = threading.Lock()
        torch_dtype = torch.bfloat16 if dtype == "bfloat16" else torch.float32
        self._model = SentenceTransformer(
            str(model_path),
            device=device,
            config_kwargs={"vision_config": None, "audio_config": None},
            model_kwargs={"torch_dtype": torch_dtype},
            local_files_only=True,
        )
        self._model.max_seq_length = 512

    def encode_documents(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, EMBEDDING_DIM), dtype=np.float32)
        with self._lock:
            vectors = self._model.encode(
                texts,
                prompt_name=DOCUMENT_PROMPT,
                truncate_dim=EMBEDDING_DIM,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        return np.asarray(vectors, dtype=np.float32)

    def encode_query(self, text: str) -> np.ndarray:
        with self._lock:
            vector = self._model.encode(
                [text],
                prompt_name=QUERY_PROMPT,
                truncate_dim=EMBEDDING_DIM,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        return np.asarray(vector[0], dtype=np.float32)


def _device() -> str:
    if not settings.is_gpu:
        return "cpu"
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


@lru_cache(maxsize=1)
def get_embedder() -> EmbeddingModel:
    if not settings.embedding_model_dir.exists():
        raise EmbeddingUnavailable(f"Embedding model not found at {settings.embedding_model_dir}")
    return EmbeddingModel(
        model_path=settings.embedding_model_dir,
        device=_device(),
        dtype=settings.embedding_dtype,
    )


def embeddings_ready() -> bool:
    return (settings.embedding_model_dir / "config.json").exists() and (
        settings.embedding_model_dir / "model.safetensors"
    ).exists()
