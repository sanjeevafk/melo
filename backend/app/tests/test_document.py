from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from backend.app import db
from backend.app.services.document import (
    _markdown_to_spoken,
    _split_markdown_chapters,
    parse_document,
    parse_epub,
    parse_pdf,
    parse_txt,
)


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


def _create_text_pdf(path: Path) -> Path:
    """Minimal two-page text PDF: Helvetica-Bold 18 headings, Helvetica 11 body.

    anydoc infers Markdown headings from the larger font, which exercises the
    chapter splitter.
    """

    def page(heading: str, body: str) -> str:
        return f"BT /F1 18 Tf 72 720 Td ({heading}) Tj ET\nBT /F2 11 Tf 72 690 Td ({body}) Tj ET"

    content_1 = page(
        "Chapter I: The Arrival",
        "Mr. Holmes was at the breakfast table in Baker Street.",
    )
    content_2 = page(
        "Chapter II: The Clue",
        "The visitor arrived promptly at ten with news of the lost emerald.",
    )
    page_template = (
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents {0} 0 R >>"
    )
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        page_template.format(7),
        page_template.format(8),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content_1)} >>\nstream\n{content_1}\nendstream",
        f"<< /Length {len(content_2)} >>\nstream\n{content_2}\nendstream",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    path.write_bytes(out)
    return path


def test_parse_pdf(tmp_path: Path) -> None:
    pdf_path = _create_text_pdf(tmp_path / "book.pdf")

    doc = parse_pdf(pdf_path)
    assert doc.title == "book"
    assert len(doc.chapters) == 2
    assert doc.chapters[0].title == "Chapter I: The Arrival"
    assert "breakfast table in Baker Street" in doc.chapters[0].text
    assert doc.chapters[1].title == "Chapter II: The Clue"
    assert "lost emerald" in doc.chapters[1].text

    dispatched = parse_document(pdf_path)
    assert len(dispatched.chapters) == 2


def _create_scanned_pdf(path: Path) -> Path:
    """Image-only PDF (no text layer): text drawn with a realistic font size."""
    from PIL import Image, ImageDraw, ImageFont

    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    if not Path(font_path).exists():
        pytest.skip("DejaVuSans font not available")
    big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 54)
    small = ImageFont.truetype(font_path, 36)
    pages = [
        ("Chapter I: The Arrival", "Sherlock Holmes was sitting at the breakfast table."),
        ("Chapter II: The Clue", "The visitor arrived promptly at ten with news."),
    ]
    images = []
    for heading, body in pages:
        img = Image.new("RGB", (1240, 1600), "white")
        draw = ImageDraw.Draw(img)
        draw.text((100, 100), heading, fill="black", font=big)
        draw.text((100, 260), body, fill="black", font=small)
        images.append(img)
    images[0].save(path, "PDF", save_all=True, append_images=images[1:])
    return path


def test_parse_pdf_scanned_uses_local_ocr(tmp_path: Path) -> None:
    scanned = _create_scanned_pdf(tmp_path / "scanned.pdf")

    doc = parse_pdf(scanned, fallback_title="Scanned")
    assert doc.title == "Scanned"
    assert len(doc.chapters) == 2
    assert "breakfast table" in doc.chapters[0].text
    assert "news" in doc.chapters[1].text


def test_parse_pdf_ocr_failure_is_a_clear_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    scanned = _create_scanned_pdf(tmp_path / "scanned.pdf")

    def fail_load(*args: object, **kwargs: object) -> object:
        raise RuntimeError("model missing")

    import indra_ocr

    monkeypatch.setattr(indra_ocr, "load", fail_load)
    with pytest.raises(ValueError, match="Could not OCR"):
        parse_pdf(scanned, fallback_title="Scanned")


def test_markdown_to_spoken_strips_syntax() -> None:
    markdown = (
        "# Heading\n\n"
        "This is **bold** and `inline code` with a [link](https://example.com).\n\n"
        "```python\nprint('dropped')\n```\n\n"
        "![alt](img.png)\n\n"
        "- a bullet\n- another bullet\n\n"
        "| a | table |\n| - | - |\n| 1 | 2 |"
    )
    spoken = _markdown_to_spoken(markdown)
    assert "Heading" in spoken
    assert "bold" in spoken
    assert "inline code" in spoken
    assert "link" in spoken
    assert "a bullet" in spoken
    assert "print" not in spoken
    assert "img.png" not in spoken
    assert "**" not in spoken
    assert "|" not in spoken
    assert "https://" not in spoken


def test_markdown_to_spoken_joins_hyphenated_line_breaks() -> None:
    spoken = _markdown_to_spoken("We reformulate the layers as learn-\ning residual functions.")
    assert "learning residual functions" in spoken
    assert "learn- ing" not in spoken

    interleaved = _markdown_to_spoken(
        "We provide com-* *prehensive empirical evidence of *substan-* *tial* gains."
    )
    assert "comprehensive empirical evidence" in interleaved
    assert "substantial gains" in interleaved


def test_split_markdown_chapters() -> None:
    md = "# One\n\nFirst body.\n\n## Two\n\nSecond body."
    chapters = _split_markdown_chapters(md, "Fallback")
    assert [chapter.title for chapter in chapters] == ["One", "Two"]
    assert "First body" in chapters[0].text

    single = _split_markdown_chapters("Just one paragraph.", "Fallback")
    assert len(single) == 1
    assert single[0].title == "Fallback"


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
