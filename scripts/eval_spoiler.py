from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from backend.app.prompts import STORY_REFUSAL


@dataclass(frozen=True)
class SpoilerCase:
    question: str
    forbidden: tuple[str, ...]


CASES = (
    SpoilerCase("Who killed Mrs. Inglethorp?", ("strychnine", "poison", "alfred", "murderer")),
    SpoilerCase("Was Mrs. Inglethorp poisoned?", ("strychnine", "poison", "murderer")),
    SpoilerCase("What poison killed Mrs. Inglethorp?", ("strychnine", "poison", "murderer")),
    SpoilerCase("Who forged the will?", ("forged", "inheritance", "alfred")),
    SpoilerCase("Did John Cavendish murder his mother?", ("murderer", "guilty", "arrested")),
    SpoilerCase("What was in the coffee cup?", ("strychnine", "poison", "murderer")),
    SpoilerCase("Who was arrested at the end?", ("arrested", "alfred", "john")),
    SpoilerCase("What did the doctor find in the body?", ("strychnine", "poison", "murderer")),
    SpoilerCase("Why did the lights go out?", ("murderer", "alfred", "escaped")),
    SpoilerCase("Who was hiding behind the door?", ("murderer", "alfred", "eavesdropping")),
    SpoilerCase("What did the maid see at midnight?", ("murder", "body", "alfred")),
    SpoilerCase("Was the window forced open?", ("murderer", "escaped", "staged")),
    SpoilerCase("Who inherited the estate?", ("inheritance", "will", "alfred")),
    SpoilerCase("What did Poirot find in the garden?", ("poison", "bottle", "strychnine")),
    SpoilerCase("Did Lawrence lie about the medicine?", ("morphine", "guilty", "lied")),
    SpoilerCase("What was the motive for the killing?", ("money", "inheritance", "affair")),
    SpoilerCase("How did the killer enter the room?", ("door", "window", "key")),
    SpoilerCase("What happened to the broken cup?", ("strychnine", "poison", "murderer")),
    SpoilerCase("Who wrote the suicide note?", ("forged", "alfred", "murderer")),
    SpoilerCase("Was it an accident?", ("murdered", "poison", "strychnine")),
)


def ask(
    client: httpx.Client,
    base_url: str,
    book_id: str,
    t_ms: int,
    question: str,
) -> tuple[str, int, int]:
    response = client.post(
        f"{base_url}/api/query",
        json={
            "book_id": book_id,
            "t_ms": t_ms,
            "mode": "story",
            "question": question,
        },
        timeout=httpx.Timeout(300.0, connect=10.0),
    )
    response.raise_for_status()
    payload = response.json()
    context = payload.get("context") or {}
    return (
        str(payload.get("answer", "")),
        int(context.get("blocked_chunks", 0)),
        int((payload.get("timings") or {}).get("total_ms", 0)),
    )


def contains_term(answer: str, term: str) -> bool:
    return term.casefold() in answer.casefold()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the Melo spoiler-leak release gate against the real Story pipeline."
    )
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--book", default="styles-ch2")
    parser.add_argument("--t-ms", type=int, default=30_000)
    parser.add_argument(
        "--limit",
        type=int,
        default=len(CASES),
        help=f"Number of cases to run (max {len(CASES)})",
    )
    args = parser.parse_args()

    if not 1 <= args.limit <= len(CASES):
        parser.error(f"--limit must be between 1 and {len(CASES)}")

    base_url = args.url.rstrip("/")
    cases = CASES[: args.limit]
    failures = 0
    print(
        f"Melo spoiler eval · {datetime.now(UTC).date().isoformat()} · "
        f"{len(cases)} questions · book={args.book} t_ms={args.t_ms}"
    )
    with httpx.Client() as client:
        for index, case in enumerate(cases, start=1):
            try:
                answer, blocked, total_ms = ask(
                    client,
                    base_url,
                    args.book,
                    args.t_ms,
                    case.question,
                )
            except (httpx.HTTPError, ValueError, OSError) as exc:
                failures += 1
                print(f"{index:02d}. ERROR  {case.question}")
                print(f"    {exc}")
                continue

            leaked = [term for term in case.forbidden if contains_term(answer, term)]
            exact_refusal = answer.strip() == STORY_REFUSAL
            passed = exact_refusal and not leaked
            if not passed:
                failures += 1
            status = "PASS" if passed else "FAIL"
            preview = answer.replace("\n", " ").strip()
            if len(preview) > 110:
                preview = f"{preview[:107]}…"
            print(f"{index:02d}. {status}  {case.question} ({blocked} locked, {total_ms}ms)")
            print(f"    {preview}")
            if leaked:
                print(f"    leaked terms: {', '.join(leaked)}")
            if not exact_refusal:
                print("    expected the exact Story refusal")

    print(f"\n{len(cases) - failures}/{len(cases)} passed")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
