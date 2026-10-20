from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from backend.app.errors import ApiError
from backend.app.schemas import TTSRequest
from backend.app.services.tts import TTSUnavailable, get_tts

router = APIRouter(prefix="/api", tags=["tts"])


@router.post("/tts")
def tts(request: TTSRequest) -> Response:
    try:
        wav = get_tts().wav_bytes(request.text, voice=request.voice)
    except TTSUnavailable as exc:
        raise ApiError(503, "not_ready", str(exc)) from exc
    except ValueError as exc:
        raise ApiError(400, "invalid_voice", str(exc)) from exc
    except Exception as exc:
        raise ApiError(500, "tts_failed", str(exc)) from exc
    return Response(content=wav, media_type="audio/wav")
