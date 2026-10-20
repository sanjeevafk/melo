from __future__ import annotations

import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from backend.app.config import settings


class STTUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class TranscriptWord:
    word: str
    start_ms: int
    end_ms: int


class STT:
    def __init__(self) -> None:
        from faster_whisper import WhisperModel

        self._lock = threading.Lock()
        compute_type = "float16" if settings.is_gpu else "int8"
        device = "cuda" if settings.is_gpu else "cpu"
        self._model = WhisperModel(
            str(settings.whisper_model_dir),
            device=device,
            compute_type=compute_type,
            local_files_only=True,
        )

    def transcribe(
        self,
        audio_path: Path,
        hotwords: list[str] | None = None,
        word_timestamps: bool = True,
    ) -> tuple[str, list[TranscriptWord]]:
        prompt = ", ".join(hotwords) if hotwords else None
        with self._lock:
            segments, _ = self._model.transcribe(
                str(audio_path),
                language="en",
                beam_size=5 if settings.is_gpu else 1,
                vad_filter=True,
                word_timestamps=word_timestamps,
                initial_prompt=prompt,
            )
            words: list[TranscriptWord] = []
            text_parts: list[str] = []
            for segment in segments:
                text_parts.append(segment.text.strip())
                for word in segment.words or []:
                    cleaned = word.word.strip()
                    if cleaned:
                        words.append(
                            TranscriptWord(
                                word=cleaned,
                                start_ms=int(round(word.start * 1000)),
                                end_ms=int(round(word.end * 1000)),
                            )
                        )
        return " ".join(part for part in text_parts if part), words


@lru_cache(maxsize=1)
def get_stt() -> STT:
    if not (settings.whisper_model_dir / "model.bin").exists():
        raise STTUnavailable(f"Whisper model not found at {settings.whisper_model_dir}")
    return STT()


def stt_ready() -> bool:
    return (settings.whisper_model_dir / "model.bin").exists()
