from __future__ import annotations

import json
import os
import re
import threading
from collections.abc import Callable, Iterator
from functools import lru_cache
from typing import Any

import httpx

from backend.app.config import settings

CONTEXT_TOKENS = 2048
PROMPT_TOKEN_BUDGET = 1500
MAX_ANSWER_TOKENS = 160

_EXCERPT_RE = re.compile(r"\n  <excerpt\b.*?</excerpt>", flags=re.DOTALL)
_TURN_RE = re.compile(r"\n  <turn>.*?</turn>", flags=re.DOTALL)
_TRANSCRIPT_RE = re.compile(
    r"(<immediate_transcript>)(.*?)(</immediate_transcript>)", flags=re.DOTALL
)


class LLMUnavailable(RuntimeError):
    pass


def strip_thoughts(text: str) -> str:
    cleaned = re.sub(r"<thought>.*?</thought>", "", text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if "<thought>" in cleaned.lower() and "</thought>" not in cleaned.lower():
        cleaned = re.sub(r"<thought>.*", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if "<think>" in cleaned.lower() and "</think>" not in cleaned.lower():
        cleaned = re.sub(r"<think>.*", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    return cleaned.strip()


def strip_thoughts_from_stream(token_stream: Iterator[str]) -> Iterator[str]:
    in_thought = False
    buffer = ""

    for chunk in token_stream:
        buffer += chunk
        while buffer:
            if in_thought:
                end_idx = -1
                end_tag_len = 0
                for tag in ("</thought>", "</think>"):
                    idx = buffer.lower().find(tag)
                    if idx != -1 and (end_idx == -1 or idx < end_idx):
                        end_idx = idx
                        end_tag_len = len(tag)
                if end_idx != -1:
                    buffer = buffer[end_idx + end_tag_len :]
                    in_thought = False
                else:
                    keep_len = 0
                    buf_lower = buffer.lower()
                    for tag in ("</thought>", "</think>"):
                        for i in range(1, len(tag)):
                            if buf_lower.endswith(tag[:i]):
                                keep_len = max(keep_len, i)
                    buffer = buffer[-keep_len:] if keep_len > 0 else ""
                    break
            else:
                start_idx = -1
                start_tag_len = 0
                for tag in ("<thought>", "<think>"):
                    idx = buffer.lower().find(tag)
                    if idx != -1 and (start_idx == -1 or idx < start_idx):
                        start_idx = idx
                        start_tag_len = len(tag)
                if start_idx != -1:
                    to_yield = buffer[:start_idx]
                    buffer = buffer[start_idx + start_tag_len :]
                    in_thought = True
                    if to_yield:
                        yield to_yield
                else:
                    keep_len = 0
                    buf_lower = buffer.lower()
                    for tag in ("<thought>", "<think>"):
                        for i in range(1, len(tag)):
                            if buf_lower.endswith(tag[:i]):
                                keep_len = max(keep_len, i)
                    if keep_len > 0:
                        to_yield = buffer[:-keep_len]
                        buffer = buffer[-keep_len:]
                        if to_yield:
                            yield to_yield
                        break
                    else:
                        to_yield = buffer
                        buffer = ""
                        if to_yield:
                            yield to_yield

    if buffer and not in_thought:
        yield buffer


def _fit_messages(
    messages: list[dict[str, str]],
    count_tokens: Callable[[str], int],
    max_tokens: int = PROMPT_TOKEN_BUDGET,
) -> list[dict[str, str]]:
    fitted = [dict(message) for message in messages]
    if not fitted:
        return fitted

    def total() -> int:
        return sum(count_tokens(message["content"]) + 8 for message in fitted)

    while total() > max_tokens and _TURN_RE.search(fitted[-1]["content"]):
        fitted[-1]["content"] = _TURN_RE.sub("", fitted[-1]["content"], count=1)

    while total() > max_tokens and _EXCERPT_RE.search(fitted[-1]["content"]):
        content = fitted[-1]["content"]
        matches = list(_EXCERPT_RE.finditer(content))
        if not matches:
            break
        last = matches[-1]
        fitted[-1]["content"] = content[: last.start()] + content[last.end() :]

    while total() > max_tokens:
        content = fitted[-1]["content"]
        match = _TRANSCRIPT_RE.search(content)
        if not match:
            break
        words = match.group(2).split()
        if len(words) <= 12:
            break
        kept = words[max(1, len(words) // 4) :]
        fitted[-1]["content"] = content[: match.start(2)] + " ".join(kept) + content[match.end(2) :]

    return fitted


class OllamaLLM:
    def __init__(
        self,
        endpoint: str,
        model: str,
        think: bool = False,
        timeout: float = 60.0,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.think = think
        self.timeout = timeout

    def count_tokens(self, text: str) -> int:
        return max(1, len(text.encode("utf-8")) // 4)

    def fit_prompt(self, messages: list[dict[str, str]]) -> list[dict[str, str]]:
        return _fit_messages(messages, self.count_tokens)

    def complete(self, messages: list[dict[str, str]]) -> str:
        fitted = self.fit_prompt(messages)
        url = f"{self.endpoint}/api/chat"
        payload = {
            "model": self.model,
            "messages": fitted,
            "stream": False,
            "think": self.think,
            "keep_alive": "1h",
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
                "num_predict": MAX_ANSWER_TOKENS,
            },
        }
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                content = data.get("message", {}).get("content", "")
                return strip_thoughts(content)
        except Exception as exc:
            raise LLMUnavailable(f"Ollama completion failed: {exc}") from exc

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        fitted = self.fit_prompt(messages)
        url = f"{self.endpoint}/api/chat"
        payload = {
            "model": self.model,
            "messages": fitted,
            "stream": True,
            "think": self.think,
            "keep_alive": "1h",
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
                "num_predict": MAX_ANSWER_TOKENS,
            },
        }

        def _raw_stream() -> Iterator[str]:
            try:
                with (
                    httpx.Client(timeout=self.timeout) as client,
                    client.stream("POST", url, json=payload) as response,
                ):
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        content = chunk.get("message", {}).get("content")
                        if content:
                            yield content
            except Exception as exc:
                raise LLMUnavailable(f"Ollama stream failed: {exc}") from exc

        yield from strip_thoughts_from_stream(_raw_stream())


class OpenAILLM:
    def __init__(
        self,
        endpoint: str,
        model: str,
        timeout: float = 60.0,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.timeout = timeout

    def count_tokens(self, text: str) -> int:
        return max(1, len(text.encode("utf-8")) // 4)

    def fit_prompt(self, messages: list[dict[str, str]]) -> list[dict[str, str]]:
        return _fit_messages(messages, self.count_tokens)

    def _chat_url(self) -> str:
        if self.endpoint.endswith("/v1"):
            return f"{self.endpoint}/chat/completions"
        return f"{self.endpoint}/v1/chat/completions"

    def complete(self, messages: list[dict[str, str]]) -> str:
        fitted = self.fit_prompt(messages)
        payload = {
            "model": self.model,
            "messages": fitted,
            "stream": False,
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": MAX_ANSWER_TOKENS,
        }
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(self._chat_url(), json=payload)
                response.raise_for_status()
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                return strip_thoughts(content)
        except Exception as exc:
            raise LLMUnavailable(f"OpenAI completion failed: {exc}") from exc

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        fitted = self.fit_prompt(messages)
        payload = {
            "model": self.model,
            "messages": fitted,
            "stream": True,
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": MAX_ANSWER_TOKENS,
        }

        def _raw_stream() -> Iterator[str]:
            try:
                with (
                    httpx.Client(timeout=self.timeout) as client,
                    client.stream("POST", self._chat_url(), json=payload) as response,
                ):
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.strip():
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                choice = chunk.get("choices", [{}])[0]
                                content = choice.get("delta", {}).get("content")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                continue
            except Exception as exc:
                raise LLMUnavailable(f"OpenAI stream failed: {exc}") from exc

        yield from strip_thoughts_from_stream(_raw_stream())


class LlamaLLM:
    def __init__(self, model_path: str) -> None:
        from llama_cpp import Llama

        self._lock = threading.Lock()
        is_gemma = "gemma" in model_path.lower()
        chat_format = "gemma" if is_gemma else "chatml"
        self._stop = ["<end_of_turn>", "<eos>"] if is_gemma else None
        self._model = Llama(
            model_path=model_path,
            n_ctx=CONTEXT_TOKENS,
            n_batch=512,
            n_threads=max(2, (os.cpu_count() or 4) - 1),
            n_gpu_layers=-1 if settings.is_gpu else 0,
            chat_format=chat_format,
            verbose=False,
        )

    def count_tokens(self, text: str) -> int:
        return len(self._model.tokenize(text.encode("utf-8")))

    def fit_prompt(self, messages: list[dict[str, str]]) -> list[dict[str, str]]:
        return _fit_messages(messages, self.count_tokens)

    def complete(self, messages: list[dict[str, str]]) -> str:
        fitted = self.fit_prompt(messages)
        kwargs = {
            "messages": fitted,
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": MAX_ANSWER_TOKENS,
            "stream": False,
        }
        if self._stop:
            kwargs["stop"] = self._stop
        with self._lock:
            response = self._model.create_chat_completion(**kwargs)
        raw = str(response["choices"][0]["message"]["content"])
        return strip_thoughts(raw)

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        fitted = self.fit_prompt(messages)
        kwargs = {
            "messages": fitted,
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": MAX_ANSWER_TOKENS,
            "stream": True,
        }
        if self._stop:
            kwargs["stop"] = self._stop

        def _raw_stream() -> Iterator[str]:
            with self._lock:
                stream = self._model.create_chat_completion(**kwargs)
                for chunk in stream:
                    choice = chunk.get("choices", [{}])[0]
                    delta = choice.get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield str(content)

        yield from strip_thoughts_from_stream(_raw_stream())


LLM = LlamaLLM


def check_remote_llm(endpoint: str, timeout: float = 2.0) -> bool:
    try:
        base = endpoint.rstrip("/")
        with httpx.Client(timeout=timeout) as client:
            try:
                resp = client.get(f"{base}/api/tags")
                if resp.status_code == 200:
                    return True
            except Exception:
                pass
            resp = client.get(f"{base}/v1/models")
            return resp.status_code == 200
    except Exception:
        return False


def llm_ready() -> bool:
    if settings.llm_provider in ("ollama", "openai"):
        return check_remote_llm(settings.llm_endpoint)
    return settings.llm_model_path.exists()


@lru_cache(maxsize=1)
def get_llm() -> Any:
    provider = settings.llm_provider
    if provider == "ollama":
        if not llm_ready():
            raise LLMUnavailable(
                f"Ollama provider unavailable at {settings.llm_endpoint} "
                f"for model {settings.llm_model}"
            )
        return OllamaLLM(
            endpoint=settings.llm_endpoint,
            model=settings.llm_model,
            think=settings.llm_think,
            timeout=settings.llm_timeout_seconds,
        )
    elif provider == "openai":
        if not llm_ready():
            raise LLMUnavailable(
                f"OpenAI provider unavailable at {settings.llm_endpoint} "
                f"for model {settings.llm_model}"
            )
        return OpenAILLM(
            endpoint=settings.llm_endpoint,
            model=settings.llm_model,
            timeout=settings.llm_timeout_seconds,
        )
    elif provider == "llama_cpp":
        if not settings.llm_model_path.exists():
            raise LLMUnavailable(f"LLM model not found at {settings.llm_model_path}")
        return LlamaLLM(str(settings.llm_model_path))
    else:
        raise LLMUnavailable(f"Unknown LLM provider: {provider}")
