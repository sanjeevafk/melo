from __future__ import annotations

import io
import zipfile
from pathlib import Path

from backend.app import db
from backend.app.services.document import parse_document, parse_epub, parse_txt


def _create_mock_epub(path: Path) -> Path:
    container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""

    content_opf = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Adventure</dc:title>
    <dc:creator>Arthur Conan Doyle</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>"""

    ch1_xhtml = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter I: The Arrival</title></head>
  <body>
    <h1>Chapter I: The Arrival</h1>
    <p>Mr. Sherlock Holmes was sitting at the breakfast table in Baker Street.</p>
    <p>He held a strange parchment in his hand and looked intently at it.</p>
  </body>
</html>"""

    ch2_xhtml = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter II: The Clue</title></head>
  <body>
    <h1>Chapter II: The Clue</h1>
    <p>The visitor arrived promptly at ten o'clock with news of the lost emerald.</p>
    <p>Watson noted down the descriptions carefully in his journal.</p>
  </body>
</html>"""

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        z.writestr("META-INF/container.xml", container_xml)
        z.writestr("OEBPS/content.opf", content_opf)
        z.writestr("OEBPS/chapter1.xhtml", ch1_xhtml)
        z.writestr("OEBPS/chapter2.xhtml", ch2_xhtml)

    path.write_bytes(buffer.getvalue())
    return path


def test_parse_txt(tmp_path: Path) -> None:
    txt_file = tmp_path / "sample.txt"
    txt_file.write_text(
        "CHAPTER 1: A Fresh Start\n\nIt was a dark and stormy night.\n\n"
        "CHAPTER 2: Morning Light\n\nThe sun rose over the rolling hills.\n",
        encoding="utf-8",
    )
    doc = parse_txt(txt_file, fallback_title="My Book")
    assert doc.title == "My Book"
    assert len(doc.chapters) == 2
    assert doc.chapters[0].title == "CHAPTER 1: A Fresh Start"
    assert "dark and stormy night" in doc.chapters[0].text
    assert doc.chapters[1].title == "CHAPTER 2: Morning Light"
    assert "sun rose" in doc.chapters[1].text


def test_parse_epub(tmp_path: Path) -> None:
    epub_path = tmp_path / "book.epub"
    _create_mock_epub(epub_path)

    doc = parse_epub(epub_path)
    assert doc.title == "Test Adventure"
    assert doc.author == "Arthur Conan Doyle"
    assert len(doc.chapters) == 2
    assert "Arrival" in doc.chapters[0].title
    assert "Sherlock Holmes was sitting" in doc.chapters[0].text
    assert "Arrival" in doc.chapters[0].title
    assert "visitor arrived promptly" in doc.chapters[1].text

    dispatched = parse_document(epub_path)
    assert dispatched.title == "Test Adventure"


def test_chapters_db_crud(tmp_path: Path) -> None:
    db_file = tmp_path / "test.db"
    db.init_db(db_file)
    book_id = "test-chapters-book"

    with db.get_connection(db_file) as conn:
        conn.execute(
            """
            INSERT INTO books (
              id, title, author, source_type, default_mode, duration_ms, audio_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (book_id, "Title", "Author", "audio_upload", "story", 10000, "audio.mp3", "now"),
        )
        conn.commit()

    chapters = [
        {"id": 1, "title": "Part I", "start_ms": 0, "end_ms": 5000},
        {"id": 2, "title": "Part II", "start_ms": 5000, "end_ms": 10000},
    ]
    db.save_chapters(book_id, chapters, db_path=db_file)
    loaded = db.get_chapters(book_id, db_path=db_file)
    assert len(loaded) == 2
    assert loaded[0].title == "Part I"
    assert loaded[0].start_ms == 0
    assert loaded[0].end_ms == 5000
    assert loaded[1].title == "Part II"
    assert loaded[1].start_ms == 5000
    assert loaded[1].end_ms == 10000
