"""Head-to-head comparison between Faster-Whisper and Phonon-2.5 on question.wav."""

from __future__ import annotations

import time
from pathlib import Path

from backend.app.services.stt import STT, TranscriptWord

AUDIO_PATH = Path("backend/app/tests/fixtures/question.wav")


def bench_whisper():
    print("--- Faster-Whisper ---")
    stt = STT()
    # Warmup
    stt.transcribe(AUDIO_PATH)
    latencies = []
    text_res = ""
    words_res = []
    for _ in range(5):
        t0 = time.perf_counter()
        text_res, words_res = stt.transcribe(AUDIO_PATH)
        latencies.append((time.perf_counter() - t0) * 1000.0)
    p50 = sorted(latencies)[len(latencies) // 2]
    print(f"Whisper p50: {p50:.1f}ms")
    print(f"Whisper text: '{text_res}'")
    print(f"Whisper word count: {len(words_res)}")
    return p50, text_res, words_res


def bench_phonon():
    print("\n--- Phonon-2.5 ---")
    import fermion

    speech = fermion.load_speech("phonon-2.5")
    # Warmup
    speech.transcribe_detailed(str(AUDIO_PATH))
    latencies = []
    text_res = ""
    words_res: list[TranscriptWord] = []
    for _ in range(5):
        t0 = time.perf_counter()
        detailed = speech.transcribe_detailed(str(AUDIO_PATH))
        latencies.append((time.perf_counter() - t0) * 1000.0)
        text_res = detailed.text
        words_res = [
            TranscriptWord(
                word=w["text"].strip(),
                start_ms=int(round(w["start"] * 1000)),
                end_ms=int(round(w["end"] * 1000)),
            )
            for w in detailed.words
            if w["text"].strip()
        ]
    p50 = sorted(latencies)[len(latencies) // 2]
    print(f"Phonon-2.5 p50: {p50:.1f}ms")
    print(f"Phonon-2.5 text: '{text_res}'")
    print(f"Phonon-2.5 word count: {len(words_res)}")
    return p50, text_res, words_res


if __name__ == "__main__":
    w_p50, w_text, w_words = bench_whisper()
    p_p50, p_text, p_words = bench_phonon()

    print("\n=== HEAD-TO-HEAD COMPARISON ===")
    print(f"Whisper Latency:    {w_p50:.1f} ms")
    print(f"Phonon-2.5 Latency: {p_p50:.1f} ms ({w_p50 / p_p50:.1f}x faster!)")
    print(f"Text Match:         {'EXACT MATCH' if w_text == p_text else 'DIFFERENT'}")
    print(f"  Whisper: '{w_text}'")
    print(f"  Phonon:  '{p_text}'")
    print("\nSample Word Timestamps (Phonon vs Whisper):")
    for i in range(min(len(w_words), len(p_words))):
        w = w_words[i]
        p = p_words[i]
        print(
            f"  Whisper: {w.word:<10} [{w.start_ms}ms -> {w.end_ms}ms] | "
            f"Phonon: {p.word:<10} [{p.start_ms}ms -> {p.end_ms}ms]"
        )
