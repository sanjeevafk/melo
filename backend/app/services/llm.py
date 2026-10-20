from __future__ import annotations

import os
import re
import threading
from collections.abc import Callable, Iterator
from functools import lru_cache

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


class LLM:
    def __init__(self, model_path: str) -> None:
        from llama_cpp import Llama

        self._lock = threading.Lock()
        self._model = Llama(
            model_path=model_path,
            n_ctx=CONTEXT_TOKENS,
            n_batch=512,
            n_threads=max(2, (os.cpu_count() or 4) - 1),
            n_gpu_layers=-1 if settings.is_gpu else 0,
            chat_format="chatml",
            verbose=False,
        )

    def count_tokens(self, text: str) -> int:
        return len(self._model.tokenize(text.encode("utf-8")))

    def fit_prompt(self, messages: list[dict[str, str]]) -> list[dict[str, str]]:
        return _fit_messages(messages, self.count_tokens)

    def complete(self, messages: list[dict[str, str]]) -> str:
        fitted = self.fit_prompt(messages)
        with self._lock:
            response = self._model.create_chat_completion(
                messages=fitted,
                temperature=0.2,
                top_p=0.9,
                max_tokens=MAX_ANSWER_TOKENS,
                stream=False,
            )
        return str(response["choices"][0]["message"]["content"])

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        fitted = self.fit_prompt(messages)
        with self._lock:
            stream = self._model.create_chat_completion(
                messages=fitted,
                temperature=0.2,
                top_p=0.9,
                max_tokens=MAX_ANSWER_TOKENS,
                stream=True,
            )
            for chunk in stream:
                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                content = delta.get("content")
                if content:
                    yield str(content)


@lru_cache(maxsize=1)
def get_llm() -> LLM:
    if not settings.llm_model_path.exists():
        raise LLMUnavailable(f"LLM model not found at {settings.llm_model_path}")
    return LLM(str(settings.llm_model_path))


def llm_ready() -> bool:
    return settings.llm_model_path.exists()
