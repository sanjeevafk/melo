from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from backend.app.config import settings
from backend.app.db import init_db
from backend.app.services.ingest import WordTimingInput, ingest_book

ASSETS = {
    "styles-ch2": {
        "title": "The Mysterious Affair at Styles",
        "author": "Agatha Christie",
        "default_mode": "story",
        "chapter": 2,
        "hotwords": ["Poirot", "Cavendish", "Inglethorp", "Bauerstein", "Styles"],
    },
    "attention": {
        "title": "Attention Is All You Need",
        "author": None,
        "default_mode": "study",
        "chapter": None,
        "hotwords": ["Transformer", "attention", "encoder", "decoder"],
    },
}


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


def ingest_asset(book_id: str) -> None:
    config = ASSETS[book_id]
    book_dir = settings.books_dir / book_id
    audio_path = book_dir / "audio.mp3"
    source_path = book_dir / "source.txt"
    words_path = book_dir / "words.json"
    provenance_path = book_dir / "provenance.json"

    missing = [
        path.name
        for path in (audio_path, source_path, words_path, provenance_path)
        if not path.exists()
    ]
    if missing:
        raise SystemExit(f"{book_id}: missing {', '.join(missing)}; run make assets first")

    payload = json.loads(words_path.read_text(encoding="utf-8"))
    words = [
        WordTimingInput(
            word=str(item["word"]),
            start_ms=int(item["start_ms"]),
            end_ms=int(item["end_ms"]),
        )
        for item in payload
    ]
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    result = ingest_book(
        book_id=book_id,
        title=str(config["title"]),
        author=config["author"],
        audio_path=audio_path,
        duration_ms=_duration_ms(audio_path),
        source_text=source_path.read_text(encoding="utf-8"),
        source_type="demo_audio",
        default_mode=str(config["default_mode"]),
        provenance=provenance,
        hotwords=list(config["hotwords"]),
        words=words,
        chapter=config["chapter"],
    )
    print(
        f"ingested {result.book_id}: {result.chunks} chunks, "
        f"{result.words} words"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest demo assets into SQLite")
    parser.add_argument("--book", choices=sorted(ASSETS), action="append")
    args = parser.parse_args()
    settings.ensure_directories()
    init_db()
    for book_id in args.book or sorted(ASSETS):
        ingest_asset(book_id)


if __name__ == "__main__":
    main()
