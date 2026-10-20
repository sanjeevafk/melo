# ruff: noqa: E501
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import wave
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np

from backend.app.config import settings
from backend.app.prompts import split_sentences

STORY_URL = "https://www.gutenberg.org/files/863/863-0.txt"
STORY_TITLE = "The Mysterious Affair at Styles"
STORY_AUTHOR = "Agatha Christie"
STORY_VOICE = "am_michael"
STUDY_TITLE = "Attention Is All You Need"
STUDY_AUTHOR = None
STUDY_VOICE = "bf_emma"
STUDY_URL = "https://arxiv.org/abs/1706.03762"

STUDY_TEXT = """The paper Attention Is All You Need introduced the Transformer, an architecture that replaced recurrence and convolution with attention as the main mechanism for sequence modeling. At the time, most translation systems used recurrent neural networks, often with an encoder that read the source sentence and a decoder that produced the target sentence one token at a time. Those models were powerful, but their sequential structure made training difficult to parallelize and made long-range dependencies hard to learn.

The Transformer keeps the encoder-decoder shape but removes recurrence. Each layer uses self-attention, a operation that lets every position look at every other position in the sequence and decide which representations matter. The authors describe scaled dot-product attention. A query, a key, and a value are produced for each token. The dot product of a query and a key measures relevance, the scores are scaled by the square root of the key dimension, and a softmax turns them into weights. The output is a weighted sum of values.

Multi-head attention repeats this process several times in parallel. Different heads can learn different relationships, such as local syntax, long-distance agreement, or links between pronouns and their referents. The results are concatenated and projected back into the model dimension. Because all positions are processed together, the computation becomes a set of large matrix operations that modern hardware can run efficiently.

The architecture also needs a way to represent order. Since attention itself has no notion of sequence position, the authors add positional encodings to the input embeddings. The original paper uses fixed sinusoidal functions, which allow the model to infer relative positions and generalize to sequences longer than those seen during training.

Each encoder layer combines multi-head self-attention with a position-wise feed-forward network. Each sublayer is wrapped in a residual connection and layer normalization. The decoder adds masked self-attention, so a position cannot attend to future target tokens during training, and cross-attention, so it can consult the encoder output. Masking is essential: without it, the model could simply copy the answer it is trying to predict.

The feed-forward network is applied independently to each position. It consists of two linear transformations with a ReLU activation in between. The paper uses a wider inner dimension than the model dimension, giving the network capacity to transform each token representation after attention has gathered context. Residual connections help gradients flow through deep stacks, and layer normalization stabilizes training.

The authors train the model on large translation datasets and report strong results while using substantially less computation than recurrent baselines. The big attention model achieved state-of-the-art translation quality on English-to-German and English-to-French benchmarks. The paper also shows that the architecture transfers to English constituency parsing, suggesting that the design is not limited to translation.

Several design choices matter. Scaled dot-product attention is faster than additive attention in practice because it can use highly optimized matrix multiplication. Multi-head attention increases representational capacity without increasing the total computational cost as much as a single very wide head would. The sinusoidal encoding needs no learned parameters and gives the model a consistent signal about position.

The Transformer's influence extends far beyond machine translation. Its ability to process sequences in parallel made it a foundation for large language models, vision transformers, speech models, and multimodal systems. The paper's central claim is simple: attention alone, combined with feed-forward layers, residual connections, and normalization, can model sequences effectively. That claim changed the direction of deep learning.

For EchoRead, the paper is a useful study example because it contains definitions, design motivations, experimental results, and limitations. A listener may ask what a query is, why masking matters, or how multi-head attention differs from a single head. Study mode can connect those questions to the document while still using general background knowledge for definitions and analogies. The key is to keep the answer tied to the source and to label anything that goes beyond it.
"""


def _download_story() -> str:
    request = Request(STORY_URL, headers={"User-Agent": "EchoRead demo asset builder"})
    with urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8-sig")


def _story_body(raw: str) -> str:
    start = raw.find("CHAPTER II.", 2000)
    end = raw.find("CHAPTER III.", start + 10)
    if start < 0 or end < 0:
        raise RuntimeError("Could not locate Chapter II in the Gutenberg text")
    body = raw[start:end]
    body = re.sub(r"^CHAPTER II\.\s*\nTHE 16TH AND 17TH OF JULY\s*", "", body)
    paragraphs = [re.sub(r"\s+", " ", paragraph).strip() for paragraph in body.split("\n\n")]
    return "\n\n".join(paragraph for paragraph in paragraphs if paragraph)


def _take_sentences(text: str, target_words: int) -> list[str]:
    sentences = split_sentences(text.replace("\n", " "))
    selected: list[str] = []
    count = 0
    for sentence in sentences:
        words = len(re.findall(r"\S+", sentence))
        if selected and count + words > target_words:
            break
        selected.append(sentence)
        count += words
    return selected


def _write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    pcm = np.clip(samples, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm16.tobytes())


def _duration_ms(path: Path) -> int:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return int(round(float(result.stdout.strip()) * 1000))


def _narrate(sentences: list[str], voice: str) -> tuple[np.ndarray, int, list[dict[str, int | str]]]:
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(str(settings.kokoro_model_path), str(settings.kokoro_voices_path))
    chunks: list[np.ndarray] = []
    words: list[dict[str, int | str]] = []
    cursor_ms = 0
    sample_rate = 24_000
    silence = np.zeros(int(sample_rate * 0.25), dtype=np.float32)

    for sentence_index, sentence in enumerate(sentences):
        samples, sample_rate = kokoro.create(
            sentence,
            voice=voice,
            speed=1.0,
            lang="en-us",
            trim=True,
            sentence_pause=0.0,
        )
        samples = np.asarray(samples, dtype=np.float32)
        duration_ms = int(round(len(samples) / sample_rate * 1000))
        tokens = re.findall(r"\S+", sentence)
        weights = [max(1, len(token) + 1) for token in tokens]
        total_weight = sum(weights)
        offset = 0
        for token, weight in zip(tokens, weights, strict=True):
            start = cursor_ms + int(duration_ms * offset / total_weight)
            offset += weight
            end = cursor_ms + int(duration_ms * offset / total_weight)
            words.append(
                {
                    "word": token,
                    "start_ms": start,
                    "end_ms": max(start + 1, end),
                }
            )
        chunks.append(samples)
        cursor_ms += duration_ms
        if sentence_index < len(sentences) - 1:
            chunks.append(silence)
            cursor_ms += int(round(len(silence) / sample_rate * 1000))

    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    return audio, sample_rate, words


def build_asset(
    *,
    book_id: str,
    title: str,
    author: str | None,
    voice: str,
    sentences: list[str],
    source_url: str,
    license_name: str,
    output_root: Path,
    force: bool,
) -> dict[str, object]:
    output_dir = output_root / book_id
    if (output_dir / "audio.mp3").exists() and not force:
        print(f"skip {book_id}: {output_dir / 'audio.mp3'} exists (use --force to rebuild)")
        return {}
    output_dir.mkdir(parents=True, exist_ok=True)

    audio, sample_rate, words = _narrate(sentences, voice)
    wav_path = output_dir / "audio.wav"
    mp3_path = output_dir / "audio.mp3"
    _write_wav(wav_path, audio, sample_rate)

    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            str(mp3_path),
        ],
        check=True,
    )
    duration_ms = _duration_ms(mp3_path)
    source_text = "\n\n".join(sentences)
    (output_dir / "source.txt").write_text(source_text + "\n", encoding="utf-8")
    (output_dir / "words.json").write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
    provenance = {
        "source": "Project Gutenberg" if "gutenberg" in source_url else "Authored summary",
        "license": license_name,
        "narrator": voice,
        "generated_at": datetime.now(UTC).isoformat(),
        "source_url": source_url,
        "excerpt_start_ms": 0,
        "excerpt_end_ms": duration_ms,
    }
    (output_dir / "provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    wav_path.unlink(missing_ok=True)
    print(f"built {book_id}: {duration_ms / 1000:.1f}s, {len(words)} words -> {mp3_path}")
    return {"book_id": book_id, "duration_ms": duration_ms, "words": len(words)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the two local EchoRead demo assets")
    parser.add_argument("--force", action="store_true", help="rebuild existing assets")
    parser.add_argument("--story-words", type=int, default=700)
    parser.add_argument("--study-words", type=int, default=650)
    args = parser.parse_args()

    if not settings.kokoro_model_path.exists() or not settings.kokoro_voices_path.exists():
        raise SystemExit("Kokoro models are missing. Run: make models")
    settings.ensure_directories()

    raw = _download_story()
    story = _take_sentences(_story_body(raw), args.story_words)
    study = _take_sentences(STUDY_TEXT, args.study_words)

    build_asset(
        book_id="styles-ch2",
        title=STORY_TITLE,
        author=STORY_AUTHOR,
        voice=STORY_VOICE,
        sentences=story,
        source_url=STORY_URL,
        license_name="Public domain (Project Gutenberg)",
        output_root=settings.books_dir,
        force=args.force,
    )
    build_asset(
        book_id="attention",
        title=STUDY_TITLE,
        author=STUDY_AUTHOR,
        voice=STUDY_VOICE,
        sentences=study,
        source_url=STUDY_URL,
        license_name="Authored summary; CC BY 4.0",
        output_root=settings.books_dir,
        force=args.force,
    )


if __name__ == "__main__":
    main()
