from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from backend.app.config import settings

logger = logging.getLogger(__name__)


class STTUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class TranscriptWord:
    word: str
    start_ms: int
    end_ms: int


class BaseSTT:
    def transcribe(
        self,
        audio_path: Path,
        hotwords: list[str] | None = None,
        word_timestamps: bool = True,
    ) -> tuple[str, list[TranscriptWord]]:
        raise NotImplementedError


class WhisperSTT(BaseSTT):
    def __init__(self) -> None:
        from faster_whisper import WhisperModel

        self._lock = threading.Lock()
        compute_type = "float16" if settings.is_gpu else "int8"
        device = "cuda" if settings.is_gpu else "cpu"
        self._model = WhisperModel(
            str(settings.whisper_model_dir),
            device=device,
            compute_type=compute_type,
            cpu_threads=4 if not settings.is_gpu else 0,
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


class PhononSTT(BaseSTT):
    def __init__(self) -> None:
        import fermion

        self._lock = threading.Lock()
        self._speech = fermion.load_speech(settings.phonon_model)

    def transcribe(
        self,
        audio_path: Path,
        hotwords: list[str] | None = None,
        word_timestamps: bool = True,
    ) -> tuple[str, list[TranscriptWord]]:
        with self._lock:
            if word_timestamps:
                detailed = self._speech.transcribe_detailed(
                    str(audio_path),
                    hotwords=hotwords or [],
                )
                text = (detailed.text or "").strip()
                words: list[TranscriptWord] = []
                for w in detailed.words or []:
                    word_str = (
                        w.get("text", "").strip()
                        if isinstance(w, dict)
                        else getattr(w, "text", "").strip()
                    )
                    if word_str:
                        start_val = (
                            w.get("start", 0.0)
                            if isinstance(w, dict)
                            else getattr(w, "start", 0.0)
                        )
                        end_val = (
                            w.get("end", 0.0)
                            if isinstance(w, dict)
                            else getattr(w, "end", 0.0)
                        )
                        words.append(
                            TranscriptWord(
                                word=word_str,
                                start_ms=int(round(start_val * 1000)),
                                end_ms=int(round(end_val * 1000)),
                            )
                        )
                return text, words
            else:
                text, _, _ = self._speech.transcribe(
                    str(audio_path),
                    hotwords=hotwords or [],
                )
                return (text or "").strip(), []


class STT(BaseSTT):
    """Unified STT dispatcher supporting Phonon-2.5 and Faster-Whisper."""

    def __init__(self) -> None:
        self._backend: BaseSTT
        if settings.stt_provider == "phonon":
            try:
                self._backend = PhononSTT()
                logger.info("Initialized Phonon STT (%s)", settings.phonon_model)
                return
            except Exception as exc:
                logger.warning(
                    "Failed to initialize Phonon STT (%s), falling back to Whisper: %s",
                    settings.phonon_model,
                    exc,
                )
        self._backend = WhisperSTT()
        logger.info("Initialized Whisper STT")

    def transcribe(
        self,
        audio_path: Path,
        hotwords: list[str] | None = None,
        word_timestamps: bool = True,
    ) -> tuple[str, list[TranscriptWord]]:
        return self._backend.transcribe(
            audio_path,
            hotwords=hotwords,
            word_timestamps=word_timestamps,
        )


@lru_cache(maxsize=1)
def get_stt() -> STT:
    if not stt_ready():
        raise STTUnavailable("Neither Phonon nor Whisper model is ready")
    return STT()


def stt_ready() -> bool:
    if settings.stt_provider == "phonon":
        try:
            import fermion  # noqa: F401

            return True
        except ImportError:
            pass
    return (settings.whisper_model_dir / "model.bin").exists()
