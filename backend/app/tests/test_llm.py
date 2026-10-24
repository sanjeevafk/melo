from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from backend.app.services.llm import (
    OllamaLLM,
    OpenAILLM,
    check_remote_llm,
    strip_thoughts,
    strip_thoughts_from_stream,
)


def test_strip_thoughts_basic():
    assert strip_thoughts("Hello world") == "Hello world"
    assert strip_thoughts("<thought>thinking...</thought>Hello world") == "Hello world"
    assert strip_thoughts("<think>thinking...</think>Hello world") == "Hello world"
    both = "<thought>first</thought>Hello <thought>second</thought>world"
    assert strip_thoughts(both) == "Hello world"
    assert strip_thoughts("<thought>unclosed thought") == ""
    assert strip_thoughts("<think>unclosed thought") == ""


def test_strip_thoughts_from_stream():
    tokens = ["Hello ", "world", "!"]
    assert list(strip_thoughts_from_stream(iter(tokens))) == ["Hello ", "world", "!"]

    tokens = ["<thought>thinking...</thought>Hello world"]
    assert list(strip_thoughts_from_stream(iter(tokens))) == ["Hello world"]

    tokens = ["<tho", "ught>", "I need to analyze this", "</tho", "ught>", "The ", "answer."]
    assert "".join(strip_thoughts_from_stream(iter(tokens))) == "The answer."

    tokens = ["<th", "ink>", "reasoning here", "</think>", "Direct answer"]
    assert "".join(strip_thoughts_from_stream(iter(tokens))) == "Direct answer"

    tokens = ["Value is < 5 and ", "greater than > 2"]
    assert "".join(strip_thoughts_from_stream(iter(tokens))) == "Value is < 5 and greater than > 2"


def test_ollama_llm_complete(monkeypatch):
    ollama = OllamaLLM("http://127.0.0.1:11434", "gemma4:e2b")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "message": {"content": "<thought>reasoning</thought>Poirot is a detective."}
    }

    with patch("httpx.Client.post", return_value=mock_resp):
        res = ollama.complete([{"role": "user", "content": "Who is Poirot?"}])
        assert res == "Poirot is a detective."


def test_ollama_llm_stream(monkeypatch):
    ollama = OllamaLLM("http://127.0.0.1:11434", "gemma4:e2b")

    lines = [
        json.dumps({"message": {"content": ""}, "done": False}),
        json.dumps({"message": {"content": "<thought>analyzing</thought>Poirot"}, "done": False}),
        json.dumps({"message": {"content": " is here."}, "done": False}),
        json.dumps({"message": {"content": ""}, "done": True}),
    ]

    mock_stream = MagicMock()
    mock_stream.__enter__.return_value.iter_lines.return_value = lines
    mock_stream.__enter__.return_value.raise_for_status = MagicMock()

    with patch("httpx.Client.stream", return_value=mock_stream):
        stream_chunks = list(ollama.stream([{"role": "user", "content": "Who is Poirot?"}]))
        assert "".join(stream_chunks) == "Poirot is here."


def test_openai_llm_complete(monkeypatch):
    openai = OpenAILLM("http://127.0.0.1:11434", "gemma4:e2b")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "<think>thoughts</think>Hastings is here."}}]
    }

    with patch("httpx.Client.post", return_value=mock_resp):
        res = openai.complete([{"role": "user", "content": "Where is Hastings?"}])
        assert res == "Hastings is here."


def test_openai_llm_stream(monkeypatch):
    openai = OpenAILLM("http://127.0.0.1:11434", "gemma4:e2b")

    first_delta = {"choices": [{"delta": {"content": "<thought>thinking</thought>Hastings"}}]}
    lines = [
        "data: " + json.dumps(first_delta),
        "data: " + json.dumps({"choices": [{"delta": {"content": " is here."}}]}),
        "data: [DONE]",
    ]

    mock_stream = MagicMock()
    mock_stream.__enter__.return_value.iter_lines.return_value = lines
    mock_stream.__enter__.return_value.raise_for_status = MagicMock()

    with patch("httpx.Client.stream", return_value=mock_stream):
        stream_chunks = list(openai.stream([{"role": "user", "content": "Where is Hastings?"}]))
        assert "".join(stream_chunks) == "Hastings is here."


def test_llm_ready_ollama(monkeypatch):
    with patch("httpx.Client.get") as mock_get:
        mock_get.return_value.status_code = 200
        assert check_remote_llm("http://fake-host:11434") is True

    with patch("httpx.Client.get", side_effect=Exception("network down")):
        assert check_remote_llm("http://fake-host:11434") is False
