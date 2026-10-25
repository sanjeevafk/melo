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


def test_openai_chat_url_variants():
    assert (
        OpenAILLM("https://api.groq.com/openai/v1", "llama-3.3-70b")._chat_url()
        == "https://api.groq.com/openai/v1/chat/completions"
    )
    assert (
        OpenAILLM("https://api.groq.com/openai/v1/", "llama-3.3-70b")._chat_url()
        == "https://api.groq.com/openai/v1/chat/completions"
    )
    assert (
        OpenAILLM("http://localhost:1234", "mistral")._chat_url()
        == "http://localhost:1234/v1/chat/completions"
    )


def test_openai_llm_sends_bearer_when_key_set():
    openai = OpenAILLM("https://api.groq.com/openai/v1", "llama-3.3-70b", api_key="gsk_test")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"choices": [{"message": {"content": "Hi"}}]}

    with patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        openai.complete([{"role": "user", "content": "Hello"}])
        headers = mock_post.call_args.kwargs["headers"]
        assert headers == {"Authorization": "Bearer gsk_test"}

    mock_stream = MagicMock()
    mock_stream.__enter__.return_value.iter_lines.return_value = ["data: [DONE]"]
    with patch("httpx.Client.stream", return_value=mock_stream) as mock_stream_call:
        list(openai.stream([{"role": "user", "content": "Hello"}]))
        headers = mock_stream_call.call_args.kwargs["headers"]
        assert headers == {"Authorization": "Bearer gsk_test"}


def test_openai_llm_omits_header_without_key():
    openai = OpenAILLM("http://localhost:1234", "mistral")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"choices": [{"message": {"content": "Hi"}}]}

    with patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        openai.complete([{"role": "user", "content": "Hello"}])
        assert mock_post.call_args.kwargs["headers"] is None


def test_check_remote_llm_sends_api_key():
    tags_miss = MagicMock()
    tags_miss.status_code = 404
    models_hit = MagicMock()
    models_hit.status_code = 200
    with patch("httpx.Client.get", side_effect=[tags_miss, models_hit]) as mock_get:
        assert check_remote_llm("https://api.groq.com/openai/v1", api_key="gsk_test") is True
        # Both the Ollama probe and the OpenAI-compatible probe carry the key.
        assert mock_get.call_args_list[0].kwargs["headers"] == {"Authorization": "Bearer gsk_test"}
        assert mock_get.call_args_list[1].kwargs["headers"] == {"Authorization": "Bearer gsk_test"}


def test_check_remote_llm_no_header_without_key():
    with patch("httpx.Client.get") as mock_get:
        mock_get.return_value.status_code = 200
        assert check_remote_llm("http://localhost:11434") is True
        assert mock_get.call_args_list[0].kwargs["headers"] is None


def test_llm_ready_openai_uses_configured_key():
    from backend.app.services import llm as llm_module

    with (
        patch.object(llm_module.settings, "llm_provider", "openai"),
        patch.object(llm_module.settings, "llm_endpoint", "https://api.groq.com/openai/v1"),
        patch.object(llm_module.settings, "llm_api_key", "gsk_test"),
        patch("httpx.Client.get") as mock_get,
    ):
        mock_get.return_value.status_code = 200
        assert llm_module.llm_ready() is True
        assert mock_get.call_args_list[-1].kwargs["headers"] == {"Authorization": "Bearer gsk_test"}
