from __future__ import annotations

import html
import re
import subprocess
import wave
import xml.etree.ElementTree as ET
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

import numpy as np

from backend.app.prompts import split_sentences
from backend.app.services.tts import get_tts


@dataclass(frozen=True)
class ParsedChapter:
    title: str
    text: str


@dataclass(frozen=True)
class ParsedDocument:
    title: str
    author: str | None
    chapters: list[ParsedChapter]


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.paragraphs: list[str] = []
        self._current_text: list[str] = []
        self.title: str | None = None
        self._in_title = False
        self._in_h1 = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "title":
            self._in_title = True
        elif tag.lower() in {"h1", "h2"}:
            self._in_h1 = True
        elif (
            tag.lower() in {"p", "div", "blockquote", "li", "h3", "h4", "h5", "h6"}
            and self._current_text
        ):
            text = " ".join("".join(self._current_text).split())
            if text:
                self.paragraphs.append(text)
            self._current_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False
        elif tag.lower() in {"h1", "h2"}:
            self._in_h1 = False
            if self._current_text:
                heading = " ".join("".join(self._current_text).split())
                if heading and not self.title:
                    self.title = heading
                self._current_text = []
        elif (
            tag.lower() in {"p", "div", "blockquote", "li", "h3", "h4", "h5", "h6"}
            and self._current_text
        ):
            text = " ".join("".join(self._current_text).split())
            if text:
                self.paragraphs.append(text)
            self._current_text = []

    def handle_data(self, data: str) -> None:
        clean = data.strip()
        if not clean:
            return
        if self._in_title and not self.title:
            self.title = clean
        self._current_text.append(data)

    def close(self) -> None:
        super().close()
        if self._current_text:
            text = " ".join("".join(self._current_text).split())
            if text:
                self.paragraphs.append(text)
            self._current_text = []


def _clean_html_text(raw_html: str) -> tuple[str, str | None]:
    parser = _HTMLTextExtractor()
    parser.feed(html.unescape(raw_html))
    parser.close()
    body_text = "\n\n".join(parser.paragraphs)
    return body_text, parser.title


def parse_epub(path: Path, fallback_title: str | None = None) -> ParsedDocument:
    with zipfile.ZipFile(path, "r") as z:
        try:
            container_xml = z.read("META-INF/container.xml")
            c_root = ET.fromstring(container_xml)
            rootfile = c_root.find(".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile")
            if rootfile is None:
                rootfile = c_root.find(".//rootfile")
            if rootfile is None or "full-path" not in rootfile.attrib:
                raise ValueError("Could not find OPF full-path in container.xml")
            opf_path = rootfile.attrib["full-path"]
        except Exception as exc:
            raise ValueError(f"Invalid EPUB structure: {exc}") from exc

        opf_bytes = z.read(opf_path)
        opf_root = ET.fromstring(opf_bytes)
        opf_dir = Path(opf_path).parent

        ns = {"dc": "http://purl.org/dc/elements/1.1/", "opf": "http://www.idpf.org/2007/opf"}
        title_el = opf_root.find(".//dc:title", ns)
        if title_el is None:
            title_el = opf_root.find(".//{http://purl.org/dc/elements/1.1/}title")
        title = (
            title_el.text.strip()
            if title_el is not None and title_el.text
            else (fallback_title or path.stem)
        )

        creator_el = opf_root.find(".//dc:creator", ns)
        if creator_el is None:
            creator_el = opf_root.find(".//{http://purl.org/dc/elements/1.1/}creator")
        author = creator_el.text.strip() if creator_el is not None and creator_el.text else None

        manifest: dict[str, str] = {}
        for item in opf_root.findall(".//{http://www.idpf.org/2007/opf}item"):
            manifest[item.attrib.get("id", "")] = item.attrib.get("href", "")
        if not manifest:
            for item in opf_root.findall(".//item"):
                manifest[item.attrib.get("id", "")] = item.attrib.get("href", "")

        spine_items: list[str] = []
        for itemref in opf_root.findall(".//{http://www.idpf.org/2007/opf}itemref"):
            spine_items.append(itemref.attrib.get("idref", ""))
        if not spine_items:
            for itemref in opf_root.findall(".//itemref"):
                spine_items.append(itemref.attrib.get("idref", ""))

        chapters: list[ParsedChapter] = []
        for item_id in spine_items:
            href = manifest.get(item_id)
            if not href:
                continue
            item_path = str(opf_dir / href) if str(opf_dir) != "." else href
            item_path = item_path.replace("\\", "/")
            if item_path not in z.namelist():
                if href in z.namelist():
                    item_path = href
                else:
                    continue

            content = z.read(item_path).decode("utf-8", errors="replace")
            body_text, ch_title = _clean_html_text(content)
            if len(body_text.strip()) > 30:
                title_clean = ch_title or f"Chapter {len(chapters) + 1}"
                chapters.append(ParsedChapter(title=title_clean, text=body_text))

        if not chapters:
            raise ValueError("No text content found in EPUB")

        return ParsedDocument(title=title, author=author, chapters=chapters)


def parse_txt(path: Path, fallback_title: str | None = None) -> ParsedDocument:
    raw = path.read_text(encoding="utf-8", errors="replace")
    title = fallback_title or path.stem

    pattern = re.compile(r"(?:^|\n)(CHAPTER\s+[0-9IVXLCDM]+[^\n]*|#+\s+[^\n]+)", re.IGNORECASE)
    splits = pattern.split(raw)
    chapters: list[ParsedChapter] = []

    if len(splits) > 2:
        preamble = splits[0].strip()
        if preamble:
            chapters.append(ParsedChapter(title="Prologue", text=preamble))
        for i in range(1, len(splits), 2):
            header = splits[i].strip("# ").strip()
            body = splits[i + 1].strip() if i + 1 < len(splits) else ""
            if body:
                chapters.append(ParsedChapter(title=header, text=body))
    else:
        chapters.append(ParsedChapter(title="Chapter 1", text=raw.strip()))

    return ParsedDocument(title=title, author=None, chapters=chapters)


def parse_document(path: Path, fallback_title: str | None = None) -> ParsedDocument:
    suffix = path.suffix.lower()
    if suffix == ".epub":
        return parse_epub(path, fallback_title)
    if suffix == ".pdf":
        return parse_pdf(path, fallback_title)
    return parse_txt(path, fallback_title)


_MD_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def _markdown_to_spoken(markdown: str) -> str:
    """Flatten Markdown to plain spoken text: drop code blocks and images,
    unwrap links and emphasis, keep the words."""
    text = re.sub(r"```.*?```", " ", markdown, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_~]{1,3}", "", text)
    # Justified PDFs hyphenate at line ends and anydoc wraps the fragments in
    # emphasis markers ("learn-* *ing"). Strip markers first, then rejoin —
    # without this the TTS pauses mid-word. A compound hyphenated at a line
    # break ("high- level") is joined too ("highlevel"): the rarer wrong
    # outcome, and suspended hyphens ("pre - and") keep their leading space
    # so they are untouched.
    text = re.sub(r"(\w)-[ \t\n]+(\w)", r"\1\2", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\|", " ", text)
    text = re.sub(r"[*_~]{1,3}", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_markdown_chapters(markdown: str, fallback_title: str) -> list[ParsedChapter]:
    matches = list(_MD_HEADING_RE.finditer(markdown))
    if len(matches) < 2:
        text = _markdown_to_spoken(markdown)
        return [ParsedChapter(title=fallback_title, text=text)] if text else []
    chapters: list[ParsedChapter] = []
    preamble = _markdown_to_spoken(markdown[: matches[0].start()])
    if len(preamble) > 30:
        chapters.append(ParsedChapter(title="Introduction", text=preamble))
    for index, match in enumerate(matches):
        title = match.group(2).strip()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        body = _markdown_to_spoken(markdown[match.end() : end])
        if body:
            chapters.append(ParsedChapter(title=title, text=body))
    return chapters or [ParsedChapter(title=fallback_title, text=_markdown_to_spoken(markdown))]


def parse_pdf(path: Path, fallback_title: str | None = None) -> ParsedDocument:
    """Parse a (text-based) PDF via anydoc, fully locally.

    Scanned PDFs raise NeedsOcrError; we surface that instead of opting into
    hosted OCR, which would send the document to a third party.
    """
    import anydoc

    try:
        markdown = anydoc.to_markdown(str(path), ocr="reject")
    except anydoc.NeedsOcrError as exc:
        raise ValueError(
            "This PDF looks scanned or image-only. OCR is not supported locally, "
            "so there is no text to narrate."
        ) from exc
    except anydoc.EncryptedError as exc:
        raise ValueError(
            "This PDF is password-protected. Remove the password and upload it again."
        ) from exc
    except anydoc.ConvertError as exc:
        raise ValueError(f"Could not read this document: {exc}") from exc

    title = fallback_title or path.stem
    chapters = _split_markdown_chapters(markdown, title)
    if not chapters:
        raise ValueError("No readable text found in this PDF")
    return ParsedDocument(title=title, author=None, chapters=chapters)


def synthesize_document(
    doc: ParsedDocument,
    output_audio_path: Path,
    voice: str = "af_heart",
    on_progress: Callable[[int, str], None] | None = None,
) -> tuple[int, list[dict[str, object]], list[dict[str, object]]]:
    tts = get_tts()
    chunks: list[np.ndarray] = []
    word_timings: list[dict[str, object]] = []
    chapter_metadata: list[dict[str, object]] = []
    sample_rate = 24_000
    cursor_ms = 0
    silence = np.zeros(int(sample_rate * 0.25), dtype=np.float32)

    total_sentences = sum(len(split_sentences(ch.text.replace("\n", " "))) for ch in doc.chapters)
    processed_sentences = 0

    for ch_idx, chapter in enumerate(doc.chapters):
        ch_start_ms = cursor_ms
        sentences = split_sentences(chapter.text.replace("\n", " "))
        for sentence in sentences:
            trimmed = sentence.strip()
            if not trimmed:
                continue
            samples, sr = tts.synthesize(trimmed, voice=voice)
            sample_rate = sr
            duration_ms = int(round(len(samples) / sample_rate * 1000))
            tokens = re.findall(r"\S+", trimmed)
            weights = [max(1, len(token) + 1) for token in tokens]
            total_weight = sum(weights) or 1
            offset = 0
            for token, weight in zip(tokens, weights, strict=True):
                start = cursor_ms + int(duration_ms * offset / total_weight)
                offset += weight
                end = cursor_ms + int(duration_ms * offset / total_weight)
                word_timings.append(
                    {
                        "word": token,
                        "start_ms": start,
                        "end_ms": max(start + 1, end),
                    }
                )
            chunks.append(samples)
            cursor_ms += duration_ms
            chunks.append(silence)
            cursor_ms += int(round(len(silence) / sample_rate * 1000))
            processed_sentences += 1
            if on_progress and total_sentences > 0:
                pct = int(10 + (processed_sentences / total_sentences) * 60)
                on_progress(pct, f"Synthesizing speech ({processed_sentences}/{total_sentences})")

        ch_end_ms = cursor_ms
        chapter_metadata.append(
            {
                "id": ch_idx + 1,
                "title": chapter.title,
                "start_ms": ch_start_ms,
                "end_ms": max(ch_start_ms + 1, ch_end_ms),
            }
        )

    all_samples = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    pcm = np.clip(all_samples, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype(np.int16)

    output_audio_path.parent.mkdir(parents=True, exist_ok=True)
    temp_wav = output_audio_path.with_suffix(".temp.wav")
    with wave.open(str(temp_wav), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm16.tobytes())

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(temp_wav),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "64k",
                "-ar",
                str(sample_rate),
                "-ac",
                "1",
                str(output_audio_path),
            ],
            check=True,
        )
    finally:
        temp_wav.unlink(missing_ok=True)

    return cursor_ms, word_timings, chapter_metadata
