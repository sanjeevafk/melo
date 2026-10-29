from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.config import settings
from backend.app.services import stt as stt_module
from backend.app.services.stt import (
    STT,
    BaseSTT,
    PhononSTT,
    Qwen3ASRBatchSTT,
    STTUnavailable,
    TranscriptWord,
    WhisperSTT,
    check_remote_asr,
    get_batch_stt,
    get_stt,
    stt_ready,
)

QUESTION_WAV = Path(__file__).parent / "fixtures" / "question.wav"


def test_stt_ready():
    assert stt_ready() is True


def test_stt_ready_follows_whisper_when_provider_is_whisper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "stt_provider", "whisper")
    assert stt_ready() == (settings.whisper_model_dir / "model.bin").exists()


def test_stt_ready_falls_back_to_whisper_when_phonon_profile_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "stt_provider", "phonon")
    monkeypatch.setattr(stt_module, "phonon_profile_installed", lambda: False)
    assert stt_ready() == (settings.whisper_model_dir / "model.bin").exists()


def test_get_stt_returns_instance():
    stt = get_stt()
    assert isinstance(stt, STT)


def test_phonon_transcribe_words():
    phonon = PhononSTT()
    text, words = phonon.transcribe(QUESTION_WAV, word_timestamps=True)
    assert "What is the main idea so far" in text
    assert len(words) >= 5
    # Verify word timestamps are chronological and positive
    for w in words:
        assert w.start_ms >= 0
        assert w.end_ms >= w.start_ms
        assert len(w.word) > 0


def test_whisper_transcribe_words():
    if (settings.whisper_model_dir / "model.bin").exists():
        whisper = WhisperSTT()
        text, words = whisper.transcribe(QUESTION_WAV, word_timestamps=True)
        assert "What is the main idea so far" in text
        assert len(words) >= 5


def test_qwen3_asr_transcribe_words_top_level(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyResponse:
        status_code = 200
        text = "ok"

        def json(self):
            return {
                "text": "What is the main idea so far",
                "words": [
                    {"word": "What", "start": 0.0, "end": 0.25},
                    {"word": "is", "start": 0.26, "end": 0.40},
                    {"word": "the", "start": 0.41, "end": 0.55},
                    {"word": "main", "start": 0.56, "end": 0.85},
                    {"word": "idea", "start": 0.86, "end": 1.20},
                    {"word": "so", "start": 1.21, "end": 1.45},
                    {"word": "far", "start": 1.46, "end": 1.80},
                ],
            }

    monkeypatch.setattr(
        "httpx.Client.post",
        lambda *args, **kwargs: DummyResponse(),
    )

    client = Qwen3ASRBatchSTT(
        endpoint="http://localhost:8000/v1",
        model="Qwen/Qwen3-ASR-1.7B",
        api_key="test-key",
    )
    assert client._url == "http://localhost:8000/v1/audio/transcriptions"

    text, words = client.transcribe(QUESTION_WAV, word_timestamps=True)
    assert text == "What is the main idea so far"
    assert len(words) == 7
    assert words[0].word == "What"
    assert words[0].start_ms == 0
    assert words[0].end_ms == 250
    assert words[-1].word == "far"
    assert words[-1].start_ms == 1460
    assert words[-1].end_ms == 1800


def test_qwen3_asr_transcribe_segments_with_words(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyResponse:
        status_code = 200
        text = "ok"

        def json(self):
            return {
                "text": "Chapter one begin",
                "segments": [
                    {
                        "start": 0.0,
                        "end": 1.5,
                        "text": "Chapter one begin",
                        "words": [
                            {"word": "Chapter", "start": 0.0, "end": 0.5},
                            {"word": "one", "start": 0.52, "end": 0.95},
                            {"word": "begin", "start": 0.96, "end": 1.45},
                        ],
                    }
                ],
            }

    monkeypatch.setattr(
        "httpx.Client.post",
        lambda *args, **kwargs: DummyResponse(),
    )

    client = Qwen3ASRBatchSTT()
    text, words = client.transcribe(QUESTION_WAV, word_timestamps=True)
    assert text == "Chapter one begin"
    assert len(words) == 3
    assert words[1].word == "one"
    assert words[1].start_ms == 520
    assert words[1].end_ms == 950


def test_qwen3_asr_transcribe_segments_interpolation(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyResponse:
        status_code = 200
        text = "ok"

        def json(self):
            return {
                "text": "Call me Ishmael",
                "segments": [
                    {
                        "start": 1.0,
                        "end": 2.5,
                        "text": "Call me Ishmael",
                    }
                ],
            }

    monkeypatch.setattr(
        "httpx.Client.post",
        lambda *args, **kwargs: DummyResponse(),
    )

    client = Qwen3ASRBatchSTT()
    text, words = client.transcribe(QUESTION_WAV, word_timestamps=True)
    assert text == "Call me Ishmael"
    assert len(words) == 3
    assert [w.word for w in words] == ["Call", "me", "Ishmael"]
    assert words[0].start_ms == 1000
    assert words[-1].end_ms == 2500


def test_qwen3_asr_transcribe_plain_text_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyResponse:
        status_code = 200
        text = "ok"

        def json(self):
            return {
                "text": "Quick brown fox",
            }

    monkeypatch.setattr(
        "httpx.Client.post",
        lambda *args, **kwargs: DummyResponse(),
    )

    client = Qwen3ASRBatchSTT()
    text, words = client.transcribe(QUESTION_WAV, word_timestamps=True)
    assert text == "Quick brown fox"
    assert len(words) == 3
    assert words[0].start_ms == 0
    assert words[1].start_ms == 250


def test_qwen3_asr_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class ErrorResponse:
        status_code = 500
        text = "Internal Server Error"

        def json(self):
            return {"error": "Server on fire"}

    monkeypatch.setattr(
        "httpx.Client.post",
        lambda *args, **kwargs: ErrorResponse(),
    )

    client = Qwen3ASRBatchSTT()
    with pytest.raises(STTUnavailable, match="HTTP 500"):
        client.transcribe(QUESTION_WAV)

    # Missing file
    with pytest.raises(FileNotFoundError):
        client.transcribe(Path("/tmp/nonexistent-audio-file-1234.wav"))


def test_check_remote_asr(monkeypatch: pytest.MonkeyPatch) -> None:
    class OkResponse:
        status_code = 200

    class FailResponse:
        status_code = 404

    monkeypatch.setattr("httpx.Client.get", lambda *args, **kwargs: OkResponse())
    assert check_remote_asr("http://localhost:8000/v1") is True

    monkeypatch.setattr("httpx.Client.get", lambda *args, **kwargs: FailResponse())
    assert check_remote_asr("http://localhost:8000/v1") is False


def test_get_batch_stt_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    get_batch_stt.cache_clear()
    monkeypatch.setattr(settings, "batch_stt_provider", "local")
    local_stt = get_batch_stt()
    assert isinstance(local_stt, STT)

    get_batch_stt.cache_clear()
    monkeypatch.setattr(settings, "batch_stt_provider", "qwen3_asr")
    monkeypatch.setattr(stt_module, "batch_stt_ready", lambda: True)
    qwen_stt = get_batch_stt()
    assert isinstance(qwen_stt, Qwen3ASRBatchSTT)

    # Unavailable case
    get_batch_stt.cache_clear()
    monkeypatch.setattr(settings, "test_mode", False)
    monkeypatch.setattr(stt_module, "batch_stt_ready", lambda: False)
    with pytest.raises(STTUnavailable, match="Qwen3-ASR provider unavailable"):
        get_batch_stt()

    get_batch_stt.cache_clear()


def test_ingest_book_uses_batch_stt(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import numpy as np

    from backend.app.services.ingest import ingest_book

    class MockEmbedder:
        def encode_documents(self, texts: list[str]) -> np.ndarray:
            return np.zeros((len(texts), 256), dtype=np.float32)

    monkeypatch.setattr("backend.app.services.ingest.get_embedder", lambda: MockEmbedder())

    class CustomBatchSTT(BaseSTT):
        called = False

        def transcribe(self, audio_path: Path, hotwords=None, word_timestamps=True):
            self.called = True
            return "Call me Ishmael", [
                TranscriptWord(word="Call", start_ms=0, end_ms=300),
                TranscriptWord(word="me", start_ms=301, end_ms=500),
                TranscriptWord(word="Ishmael", start_ms=501, end_ms=1000),
            ]

    test_audio = tmp_path / "audio.mp3"
    test_audio.write_bytes(b"dummy audio")
    db_file = tmp_path / "test.db"

    custom_stt = CustomBatchSTT()
    result = ingest_book(
        book_id="custom-stt-book",
        title="Custom STT Book",
        author="Herman Melville",
        audio_path=test_audio,
        duration_ms=1000,
        source_text="",
        source_type="audio_upload",
        default_mode="story",
        db_path=db_file,
        stt=custom_stt,
    )
    assert custom_stt.called is True
    assert result.book_id == "custom-stt-book"
    assert result.words == 3
