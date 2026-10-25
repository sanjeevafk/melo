from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import db
from backend.app.config import settings
from backend.app.main import app
from backend.app.routers import tts as tts_router
from backend.app.routers import voice as voice_router
from backend.app.schemas import ContextPreview
from backend.app.services.retrieval import ContextResult

BOOK_ID = "test-book"
FIXTURE = Path(__file__).parent / "fixtures" / "question.wav"


def _preview(mode: str = "story") -> ContextPreview:
    return ContextPreview(
        t_ms=0,
        cutoff_ms=5000,
        buffer_start_ms=0,
        immediate_text="",
        immediate_words=[],
        retrieved=[],
        blocked_chunks=0,
        active_chunk_id=None,
        active_chunk_truncated=False,
        mode=mode,
    )


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    original = settings.data_dir
    settings.data_dir = tmp_path
    settings.ensure_directories()
    db.init_db()
    audio_path = settings.books_dir / BOOK_ID / "test.mp3"
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    audio_path.write_bytes(b"not real audio")
    embedding = np.zeros(256, dtype=np.float32).tobytes()
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO books (
                id, title, author, source_type, default_mode, duration_ms,
                audio_path, hotwords_json, provenance_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                BOOK_ID,
                "Test Book",
                "Test Author",
                "demo_audio",
                "story",
                5000,
                str(audio_path),
                None,
                None,
                "2026-01-01T00:00:00Z",
            ),
        )
        connection.execute(
            """
            INSERT INTO chunks (
                id, book_id, chunk_index, chapter, start_ms, end_ms, text,
                embedding, embedding_dim
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("test-book:c0000", BOOK_ID, 0, 1, 1000, 5000, "A test chunk.", embedding, 256),
        )
        connection.execute(
            """
            INSERT INTO words (book_id, chunk_id, idx, word, start_ms, end_ms)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (BOOK_ID, "test-book:c0000", 0, "A", 1000, 1500),
        )
        connection.commit()

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        settings.data_dir = original


def test_books_and_context_without_models(client: TestClient) -> None:
    books = client.get("/api/books")
    assert books.status_code == 200
    assert books.json()[0]["id"] == BOOK_ID

    manifest = client.get(f"/api/books/{BOOK_ID}")
    assert manifest.status_code == 200
    assert manifest.json()["audio_url"].endswith("/test.mp3")
    assert manifest.json()["chunks"][0]["text"] == "A test chunk."

    context = client.get(f"/api/books/{BOOK_ID}/context?t_ms=0&mode=story")
    assert context.status_code == 200
    assert context.json()["blocked_chunks"] == 1


def test_story_fast_refusal_does_not_call_llm(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail_complete(_: object) -> str:
        raise AssertionError("LLM must not be called for an empty story context")

    monkeypatch.setattr("backend.app.routers.query.get_llm", fail_complete)
    response = client.post(
        "/api/query",
        json={"book_id": BOOK_ID, "t_ms": 0, "mode": "story", "question": "What happened?"},
    )
    assert response.status_code == 200
    assert response.json()["answer"].startswith("That hasn't been revealed")
    assert response.json()["timings"]["llm_first_token_ms"] == 0


def test_query_study_uses_llm(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    context = ContextResult(preview=_preview("study"), prompt=[], retrieved_chunks=[])

    class FakeLLM:
        def complete(self, _: object) -> str:
            return "Attention is a retrieval mechanism."

    monkeypatch.setattr("backend.app.routers.query.build_context", lambda **_: context)
    monkeypatch.setattr("backend.app.routers.query.get_llm", lambda: FakeLLM())
    response = client.post(
        "/api/query",
        json={"book_id": BOOK_ID, "t_ms": 0, "mode": "study", "question": "What is attention?"},
    )
    assert response.status_code == 200
    assert response.json()["answer"] == "Attention is a retrieval mechanism."
    assert response.json()["timings"]["llm_first_token_ms"] >= 0


def test_tts_endpoint(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeTTS:
        def wav_bytes(self, text: str, voice: str | None = None) -> bytes:
            assert text == "Hello."
            assert voice == "af_heart"
            return b"RIFFfake"

    monkeypatch.setattr(tts_router, "get_tts", lambda: FakeTTS())
    response = client.post("/api/tts", json={"text": "Hello.", "voice": "af_heart"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFFfake"


def test_voice_fast_refusal_streams_audio(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeSTT:
        def transcribe(
            self,
            _: Path,
            hotwords: str | None = None,
            word_timestamps: bool = True,
        ) -> tuple[str, list[dict[str, object]]]:
            return "What happened?", [{"word": "What", "start_ms": 0, "end_ms": 500}]

    class FakeTTS:
        def wav_bytes(self, text: str, voice: str | None = None) -> bytes:
            return b"RIFFfake"

    monkeypatch.setattr(voice_router, "get_stt", lambda: FakeSTT())
    monkeypatch.setattr(voice_router, "get_tts", lambda: FakeTTS())
    audio = FIXTURE.read_bytes()
    with client.stream(
        "POST",
        "/api/voice-query",
        files={"audio": ("question.wav", audio, "audio/wav")},
        data={"book_id": BOOK_ID, "t_ms": "0", "mode": "story"},
    ) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line]

    types = [event["type"] for event in events]
    assert types == [
        "status",
        "transcript",
        "context",
        "answer_delta",
        "answer",
        "audio",
        "timings",
        "done",
    ]
    assert events[5]["text"].startswith("That hasn't been revealed")
    assert events[5]["seq"] == 0


def test_voice_streams_answer_sentences(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeSTT:
        def transcribe(
            self,
            _: Path,
            hotwords: str | None = None,
            word_timestamps: bool = True,
        ) -> tuple[str, list[dict[str, object]]]:
            return "What is attention?", [{"word": "What", "start_ms": 0, "end_ms": 500}]

    class FakeLLM:
        def stream(self, _: object) -> Iterator[str]:
            yield "Attention is a mechanism. "
            yield "It uses queries and keys."

    class FakeTTS:
        def wav_bytes(self, text: str, voice: str | None = None) -> bytes:
            return b"RIFF" + text.encode()

    preview = _preview("study").model_copy(
        update={"immediate_text": "The document discusses attention.", "mode": "study"}
    )
    context = ContextResult(preview=preview, prompt=[], retrieved_chunks=[])
    monkeypatch.setattr(voice_router, "get_stt", lambda: FakeSTT())
    monkeypatch.setattr(voice_router, "get_llm", lambda: FakeLLM())
    monkeypatch.setattr(voice_router, "get_tts", lambda: FakeTTS())
    monkeypatch.setattr(voice_router, "build_context", lambda **_: context)
    audio = FIXTURE.read_bytes()
    with client.stream(
        "POST",
        "/api/voice-query",
        files={"audio": ("question.wav", audio, "audio/wav")},
        data={"book_id": BOOK_ID, "t_ms": "1000", "mode": "study"},
    ) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line]

    audio_events = [event for event in events if event["type"] == "audio"]
    assert len(audio_events) == 2
    assert audio_events[0]["seq"] == 0
    assert audio_events[1]["seq"] == 1
    assert audio_events[0]["text"] == "Attention is a mechanism."
    assert events[-1] == {"type": "done"}


def test_voice_streams_first_clause_before_full_sentence(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeSTT:
        def transcribe(
            self,
            _: Path,
            hotwords: str | None = None,
            word_timestamps: bool = True,
        ) -> tuple[str, list[dict[str, object]]]:
            return "What happened?", [{"word": "What", "start_ms": 0, "end_ms": 500}]

    class FakeLLM:
        def stream(self, _: object) -> Iterator[str]:
            yield "The main idea is the events of July, "
            yield "which are recounted in detail."

    class FakeTTS:
        def wav_bytes(self, text: str, voice: str | None = None) -> bytes:
            return b"RIFF" + text.encode()

    preview = _preview("study").model_copy(
        update={"immediate_text": "The document discusses July.", "mode": "study"}
    )
    context = ContextResult(preview=preview, prompt=[], retrieved_chunks=[])
    monkeypatch.setattr(voice_router, "get_stt", lambda: FakeSTT())
    monkeypatch.setattr(voice_router, "get_llm", lambda: FakeLLM())
    monkeypatch.setattr(voice_router, "get_tts", lambda: FakeTTS())
    monkeypatch.setattr(voice_router, "build_context", lambda **_: context)
    with client.stream(
        "POST",
        "/api/voice-query",
        files={"audio": ("question.wav", FIXTURE.read_bytes(), "audio/wav")},
        data={"book_id": BOOK_ID, "t_ms": "1000", "mode": "study"},
    ) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line]

    audio_events = [event for event in events if event["type"] == "audio"]
    assert audio_events[0]["text"] == "The events of July,"
    assert audio_events[1]["text"] == "which are recounted in detail."
    assert [event["seq"] for event in audio_events] == [0, 1]


def test_upload_rejects_unsupported_audio(client: TestClient) -> None:
    response = client.post(
        "/api/upload",
        files={"audio": ("clip.wav", b"not audio", "audio/wav")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "unsupported_format"


def test_lore_endpoints_crud(client: TestClient) -> None:
    res = client.get(f"/api/books/{BOOK_ID}/lore")
    assert res.status_code == 200
    assert res.json() == []

    payload = {
        "t_ms": 1500,
        "mode": "story",
        "question": "Who was in the parlor?",
        "answer": "John Cavendish was sitting in the parlor.",
        "retrieved_chunk_ids": ["c1", "c2"],
    }
    create_res = client.post(f"/api/books/{BOOK_ID}/lore", json=payload)
    assert create_res.status_code == 200
    data = create_res.json()
    assert data["book_id"] == BOOK_ID
    assert data["t_ms"] == 1500
    assert data["question"] == payload["question"]
    assert data["answer"] == payload["answer"]
    assert data["retrieved_chunk_ids"] == ["c1", "c2"]
    entry_id = data["id"]

    list_res = client.get(f"/api/books/{BOOK_ID}/lore")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    del_res = client.delete(f"/api/books/{BOOK_ID}/lore/{entry_id}")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    empty_res = client.get(f"/api/books/{BOOK_ID}/lore")
    assert empty_res.status_code == 200
    assert empty_res.json() == []


def test_query_auto_saves_to_lore(client: TestClient) -> None:
    # Query with a refusal
    res = client.post(
        "/api/query",
        json={
            "book_id": BOOK_ID,
            "t_ms": 100,
            "mode": "story",
            "question": "Who killed Mrs. Inglethorp?",
        },
    )
    assert res.status_code == 200

    lore_res = client.get(f"/api/books/{BOOK_ID}/lore")
    assert lore_res.status_code == 200
    entries = lore_res.json()
    assert len(entries) >= 1
    assert entries[-1]["question"] == "Who killed Mrs. Inglethorp?"
    assert "revealed in the book yet" in entries[-1]["answer"]

    # Clear lore
    clear_res = client.delete(f"/api/books/{BOOK_ID}/lore")
    assert clear_res.status_code == 200
    assert clear_res.json()["cleared"] >= 1


def test_retrieval_prompt_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.app.services.retrieval import get_prompt_budget

    monkeypatch.setattr(settings, "profile", "cpu")
    assert get_prompt_budget() == (45_000, 3)

    monkeypatch.setattr(settings, "profile", "gpu")
    assert get_prompt_budget() == (90_000, 5)


def test_job_status_endpoints(client: TestClient) -> None:
    # 404 on missing job
    missing = client.get("/api/jobs/nonexistent-job-id")
    assert missing.status_code == 404

    # Create job in db and read back
    job_id = "test-job-123"
    db.create_ingest_job(
        job_id=job_id,
        status="transcribing",
        stage="Transcribing audio with Whisper…",
        progress_pct=30,
        book_id=BOOK_ID,
    )
    res = client.get(f"/api/jobs/{job_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == job_id
    assert data["status"] == "transcribing"
    assert data["progress_pct"] == 30
    assert data["stage"] == "Transcribing audio with Whisper…"
    assert data["manifest"] is None

    # Update to completed
    db.update_ingest_job(job_id, status="completed", stage="Ready", progress_pct=100)
    completed_res = client.get(f"/api/jobs/{job_id}")
    assert completed_res.status_code == 200
    comp_data = completed_res.json()
    assert comp_data["status"] == "completed"
    assert comp_data["progress_pct"] == 100
    assert comp_data["manifest"] is not None
    assert comp_data["manifest"]["id"] == BOOK_ID
    assert "chapters" in comp_data["manifest"]


def test_voice_query_passes_book_hotwords(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, object] = {}

    class FakeSTT:
        def transcribe(
            self,
            _: Path,
            hotwords: list[str] | None = None,
            word_timestamps: bool = True,
        ) -> tuple[str, list[object]]:
            captured["hotwords"] = hotwords
            return "Who is Poirot?", []

    class FakeTTS:
        def wav_bytes(self, text: str, voice: str | None = None) -> bytes:
            return b"RIFFfake"

    with db.get_connection() as connection:
        connection.execute(
            "UPDATE books SET hotwords_json = ? WHERE id = ?",
            ('["Poirot", "Cavendish", ""]', BOOK_ID),
        )
        connection.commit()

    monkeypatch.setattr(voice_router, "get_stt", lambda: FakeSTT())
    monkeypatch.setattr(voice_router, "get_tts", lambda: FakeTTS())
    with client.stream(
        "POST",
        "/api/voice-query",
        files={"audio": ("question.wav", FIXTURE.read_bytes(), "audio/wav")},
        data={"book_id": BOOK_ID, "t_ms": "0", "mode": "story"},
    ) as response:
        assert response.status_code == 200
        list(response.iter_lines())

    assert captured["hotwords"] == ["Poirot", "Cavendish"]


def test_health_endpoints(client: TestClient) -> None:
    for path in ("/api/health", "/health"):
        response = client.get(path)
        assert response.status_code == 200
        payload = response.json()
        assert "ready" in payload
        assert "models" in payload
        assert "db" in payload


def test_keep_alive_endpoints(client: TestClient) -> None:
    for path in ("/api/keep-alive", "/keep-alive", "/ping"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "app": "echoread"}
