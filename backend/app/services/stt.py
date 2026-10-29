from __future__ import annotations

import logging
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

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
        target_path = audio_path
        tmp_wav = None
        if audio_path.suffix.lower() in {".webm", ".m4a", ".ogg"}:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_name = tmp.name
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(audio_path), "-ar", "16000", "-ac", "1", tmp_name],
                check=True,
                capture_output=True,
            )
            target_path = Path(tmp_name)
            tmp_wav = target_path

        try:
            with self._lock:
                if word_timestamps:
                    detailed = self._speech.transcribe_detailed(
                        str(target_path),
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
                                w.get("end", 0.0) if isinstance(w, dict) else getattr(w, "end", 0.0)
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
                        str(target_path),
                        hotwords=hotwords or [],
                    )
                    return (text or "").strip(), []
        finally:
            if tmp_wav:
                tmp_wav.unlink(missing_ok=True)


class Qwen3ASRBatchSTT(BaseSTT):
    """Batch transcription client for self-hosted or remote Qwen3-ASR (vLLM / OpenAI-compatible)."""

    def __init__(
        self,
        endpoint: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
    ) -> None:
        raw_endpoint = endpoint or settings.qwen3_asr_endpoint
        self._model = model or settings.qwen3_asr_model
        self._api_key = api_key if api_key is not None else settings.qwen3_asr_api_key
        self._timeout = timeout if timeout is not None else settings.qwen3_asr_timeout_seconds

        base = raw_endpoint.rstrip("/")
        if base.endswith("/audio/transcriptions"):
            self._url = base
        else:
            if not base.endswith("/v1"):
                base = f"{base}/v1"
            self._url = f"{base}/audio/transcriptions"

    def transcribe(
        self,
        audio_path: Path,
        hotwords: list[str] | None = None,
        word_timestamps: bool = True,
    ) -> tuple[str, list[TranscriptWord]]:
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        headers: dict[str, str] = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        data: dict[str, Any] = {
            "model": self._model,
        }
        if word_timestamps:
            data["response_format"] = "verbose_json"
            data["timestamp_granularities[]"] = "word"
        else:
            data["response_format"] = "json"

        if hotwords:
            data["prompt"] = ", ".join(hotwords)

        mime_types = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".m4b": "audio/mp4",
            ".ogg": "audio/ogg",
            ".webm": "audio/webm",
            ".flac": "audio/flac",
        }
        content_type = mime_types.get(audio_path.suffix.lower(), "audio/octet-stream")

        try:
            with open(audio_path, "rb") as audio_file:
                files = {"file": (audio_path.name, audio_file, content_type)}
                with httpx.Client(timeout=self._timeout) as client:
                    resp = client.post(
                        self._url,
                        headers=headers,
                        data=data,
                        files=files,
                    )
        except Exception as exc:
            raise STTUnavailable(f"Qwen3-ASR request to {self._url} failed: {exc}") from exc

        if resp.status_code != 200:
            raise STTUnavailable(
                f"Qwen3-ASR server returned HTTP {resp.status_code}: {resp.text[:500]}"
            )

        try:
            res_json = resp.json()
        except Exception as exc:
            raise STTUnavailable(f"Invalid JSON response from Qwen3-ASR: {exc}") from exc

        text = (res_json.get("text") or "").strip()
        words: list[TranscriptWord] = []

        if word_timestamps:
            # 1. Direct top-level "words"
            raw_words = res_json.get("words")
            if isinstance(raw_words, list) and raw_words:
                for w in raw_words:
                    word_str = w.get("word", "").strip() if isinstance(w, dict) else str(w).strip()
                    if word_str:
                        start_s = float(w.get("start", 0.0)) if isinstance(w, dict) else 0.0
                        end_s = (
                            float(w.get("end", start_s + 0.1))
                            if isinstance(w, dict)
                            else start_s + 0.1
                        )
                        start_ms = max(0, int(round(start_s * 1000)))
                        end_ms = max(start_ms + 1, int(round(end_s * 1000)))
                        words.append(
                            TranscriptWord(word=word_str, start_ms=start_ms, end_ms=end_ms)
                        )

            # 2. Segments containing word-level timestamps or fallback interpolation
            if not words and isinstance(res_json.get("segments"), list):
                for seg in res_json["segments"]:
                    seg_words = seg.get("words")
                    if isinstance(seg_words, list) and seg_words:
                        for w in seg_words:
                            word_str = (
                                w.get("word", "").strip() if isinstance(w, dict) else str(w).strip()
                            )
                            if word_str:
                                start_s = float(w.get("start", 0.0)) if isinstance(w, dict) else 0.0
                                end_s = (
                                    float(w.get("end", start_s + 0.1))
                                    if isinstance(w, dict)
                                    else start_s + 0.1
                                )
                                start_ms = max(0, int(round(start_s * 1000)))
                                end_ms = max(start_ms + 1, int(round(end_s * 1000)))
                                words.append(
                                    TranscriptWord(word=word_str, start_ms=start_ms, end_ms=end_ms)
                                )
                    else:
                        seg_text = (seg.get("text") or "").strip()
                        tokens = seg_text.split()
                        if tokens:
                            seg_start_ms = max(0, int(round(float(seg.get("start", 0.0)) * 1000)))
                            seg_end_ms = max(
                                seg_start_ms + len(tokens),
                                int(
                                    round(float(seg.get("end", (seg_start_ms / 1000) + 1.0)) * 1000)
                                ),
                            )
                            seg_duration = max(len(tokens), seg_end_ms - seg_start_ms)
                            step = seg_duration / len(tokens)
                            for i, token in enumerate(tokens):
                                w_start = int(round(seg_start_ms + (i * step)))
                                w_end = int(round(seg_start_ms + ((i + 1) * step)))
                                words.append(
                                    TranscriptWord(
                                        word=token, start_ms=w_start, end_ms=max(w_start + 1, w_end)
                                    )
                                )

            # 3. Fallback: plain text only
            if not words and text:
                tokens = text.split()
                curr_ms = 0
                for token in tokens:
                    words.append(TranscriptWord(word=token, start_ms=curr_ms, end_ms=curr_ms + 250))
                    curr_ms += 250

        return text, words


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


def phonon_profile_installed() -> bool:
    """True when the pinned Phonon profile is unpacked in the fermion cache.

    fermion downloads the model on first use into its own cache
    (~/.cache/fermion, overridable via FERMION_CACHE_DIR), so an importable
    package does not mean a usable model.
    """
    try:
        from fermion._speech.fetch import installed
        from fermion.transcribe import _resolve

        repo, _key, pin, local_dir = _resolve(settings.phonon_model)
    except Exception:
        return False
    if local_dir is not None:
        return Path(local_dir).exists()
    return installed(repo, pin["unpack_dir"])


def stt_ready() -> bool:
    if settings.stt_provider == "phonon" and phonon_profile_installed():
        return True
    # Fall through: the STT dispatcher falls back to Whisper when Phonon
    # cannot initialize, so readiness follows the same rule.
    return (settings.whisper_model_dir / "model.bin").exists()


def check_remote_asr(endpoint: str, timeout: float = 2.0, api_key: str = "") -> bool:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else None
    try:
        base = endpoint.rstrip("/")
        if base.endswith("/audio/transcriptions"):
            base = base[: -len("/audio/transcriptions")]
        if not base.endswith("/v1"):
            base = f"{base}/v1"
        with httpx.Client(timeout=timeout) as client:
            try:
                resp = client.get(f"{base}/models", headers=headers)
                if resp.status_code == 200:
                    return True
            except Exception:
                pass
            root = base[: -len("/v1")] if base.endswith("/v1") else base
            resp_health = client.get(f"{root}/health", headers=headers)
            return resp_health.status_code == 200
    except Exception:
        return False


def batch_stt_ready() -> bool:
    if settings.batch_stt_provider == "qwen3_asr":
        return check_remote_asr(
            settings.qwen3_asr_endpoint,
            timeout=2.0,
            api_key=settings.qwen3_asr_api_key,
        )
    return stt_ready()


@lru_cache(maxsize=1)
def get_batch_stt() -> BaseSTT:
    if settings.batch_stt_provider == "qwen3_asr":
        if not settings.test_mode and not batch_stt_ready():
            raise STTUnavailable(
                f"Qwen3-ASR provider unavailable at {settings.qwen3_asr_endpoint} "
                f"for model {settings.qwen3_asr_model}"
            )
        return Qwen3ASRBatchSTT()
    return get_stt()
