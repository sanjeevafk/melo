from __future__ import annotations

from pathlib import Path

from backend.app.config import settings
from backend.app.services.stt import STT, PhononSTT, WhisperSTT, get_stt, stt_ready

QUESTION_WAV = Path(__file__).parent / "fixtures" / "question.wav"


def test_stt_ready():
    assert stt_ready() is True


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
