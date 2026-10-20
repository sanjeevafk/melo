from __future__ import annotations

import io
import json
import threading
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np

from backend.app.config import settings

DEFAULT_VOICE = "af_heart"
VALID_VOICES = {"af_heart", "am_michael", "bf_emma"}


class TTSUnavailable(RuntimeError):
    pass


class TTS:
    def __init__(self, model_path: Path, voices_path: Path) -> None:
        from kokoro_onnx import Kokoro

        self._lock = threading.Lock()
        self._model = Kokoro(str(model_path), str(voices_path))
        self._pronunciations = self._load_pronunciations()

    @staticmethod
    def _load_pronunciations() -> dict[str, str]:
        path = settings.data_dir / "pronunciations.json"
        if not path.exists():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return {str(key): str(value) for key, value in payload.items() if str(key)}

    def _apply_pronunciations(self, text: str) -> str:
        result = text
        for source, spoken in sorted(self._pronunciations.items(), key=lambda item: -len(item[0])):
            result = result.replace(source, spoken)
        return result

    def synthesize(self, text: str, voice: str | None = None) -> tuple[np.ndarray, int]:
        selected = voice or DEFAULT_VOICE
        if selected not in VALID_VOICES:
            raise ValueError(f"Unsupported voice: {selected}")
        prepared = self._apply_pronunciations(text)
        with self._lock:
            samples, sample_rate = self._model.create(
                prepared,
                voice=selected,
                speed=1.15,
                lang="en-us",
                trim=True,
                sentence_pause=0.25,
            )
        return np.asarray(samples, dtype=np.float32), int(sample_rate)

    def wav_bytes(self, text: str, voice: str | None = None) -> bytes:
        samples, sample_rate = self.synthesize(text, voice)
        pcm = np.clip(samples, -1.0, 1.0)
        pcm16 = (pcm * 32767.0).astype(np.int16)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(pcm16.tobytes())
        return buffer.getvalue()


@lru_cache(maxsize=1)
def get_tts() -> TTS:
    if not settings.kokoro_model_path.exists() or not settings.kokoro_voices_path.exists():
        raise TTSUnavailable(
            "Kokoro model not found at "
            f"{settings.kokoro_model_path} or {settings.kokoro_voices_path}"
        )
    return TTS(settings.kokoro_model_path, settings.kokoro_voices_path)


def tts_ready() -> bool:
    return settings.kokoro_model_path.exists() and settings.kokoro_voices_path.exists()
