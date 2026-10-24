from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

UPLOAD_TYPES = {
    "audio/mpeg": ".mp3",
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/m4b": ".m4b",
    "audio/x-m4b": ".m4b",
    "application/epub+zip": ".epub",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
}
DOCUMENT_EXTENSIONS = {".epub", ".pdf", ".txt"}
DOCUMENT_TYPES = {
    "application/epub+zip": ".epub",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
}
VOICE_TYPES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
}


class AudioValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ChapterInfo:
    id: int
    title: str
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class AudioInfo:
    duration_ms: int
    format_name: str
    chapters: list[ChapterInfo] = field(default_factory=list)


def detect_upload_suffix(filename: str | None, content_type: str | None) -> str | None:
    if filename:
        lower = filename.lower()
        for ext in (".mp3", ".webm", ".m4a", ".m4b", ".epub", ".pdf", ".txt"):
            if lower.endswith(ext):
                return ext
    if content_type:
        clean = content_type.split(";")[0].strip().lower()
        if clean in UPLOAD_TYPES:
            return UPLOAD_TYPES[clean]
    return None


def _ffprobe() -> str:
    binary = shutil.which("ffprobe")
    if binary is None:
        raise AudioValidationError("unsupported_format", "ffprobe is not installed")
    return binary


def probe_audio(path: Path) -> AudioInfo:
    result = subprocess.run(
        [
            _ffprobe(),
            "-v",
            "error",
            "-show_entries",
            "format=duration,format_name:chapters",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise AudioValidationError("unsupported_format", "Could not read the audio file")
    try:
        payload = json.loads(result.stdout)
        fmt = payload["format"]
        duration = float(fmt["duration"])
        format_name = str(fmt.get("format_name", ""))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise AudioValidationError("unsupported_format", "Audio duration is unavailable") from exc

    chapters: list[ChapterInfo] = []
    for idx, ch in enumerate(payload.get("chapters", [])):
        title = ch.get("tags", {}).get("title") or f"Chapter {idx + 1}"
        start_time = float(ch.get("start_time", 0.0))
        end_time = float(ch.get("end_time", 0.0))
        chapters.append(
            ChapterInfo(
                id=idx + 1,
                title=str(title),
                start_ms=int(round(start_time * 1000)),
                end_ms=int(round(end_time * 1000)),
            )
        )
    return AudioInfo(
        duration_ms=int(round(duration * 1000)),
        format_name=format_name,
        chapters=chapters,
    )


def convert_to_browser_audio(source_path: Path, target_path: Path) -> Path:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(source_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            "-ar",
            "24000",
            "-ac",
            "1",
            str(target_path),
        ],
        check=True,
    )
    return target_path


def validate_upload(
    path: Path,
    content_type: str | None,
    size: int,
    max_bytes: int,
    max_ms: int,
    suffix: str | None = None,
) -> AudioInfo:
    eff_suffix = suffix or (UPLOAD_TYPES.get(content_type or "") if content_type else None)
    if eff_suffix is None or (content_type and content_type not in UPLOAD_TYPES and not suffix):
        raise AudioValidationError(
            "unsupported_format",
            "Use MP3, WebM, M4A, M4B, EPUB, PDF, or TXT for uploads",
        )
    if size > max_bytes:
        raise AudioValidationError(
            "upload_too_large", f"Audio upload exceeds {max_bytes // 1024 // 1024} MB"
        )
    if eff_suffix in DOCUMENT_EXTENSIONS:
        return AudioInfo(duration_ms=0, format_name=eff_suffix.lstrip("."), chapters=[])
    info = probe_audio(path)
    if max_ms > 0 and info.duration_ms > max_ms:
        raise AudioValidationError(
            "upload_too_long", f"Audio upload exceeds {max_ms // 1000} seconds"
        )
    return info


def validate_voice_clip(
    path: Path,
    content_type: str | None,
    size: int,
    max_bytes: int,
    max_ms: int,
) -> AudioInfo:
    if content_type not in VOICE_TYPES:
        raise AudioValidationError(
            "unsupported_format",
            "Use a WAV, WebM, or Ogg voice clip",
        )
    if size > max_bytes:
        raise AudioValidationError("clip_too_large", "Voice clip exceeds 2 MB")
    info = probe_audio(path)
    if info.duration_ms > max_ms:
        raise AudioValidationError("clip_too_long", "Voice clip exceeds 15 seconds")
    if info.duration_ms < 300:
        raise AudioValidationError("mic_empty", "Voice clip is too short")
    return info
