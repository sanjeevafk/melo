# Spoiler evaluation

## Goal

The Story mode release check asks whether EchoRead refuses questions about events beyond the current playhead and whether it leaks forbidden terms while doing so.

`scripts/eval_spoiler.py` contains 20 adversarial questions about the plot of *The Mysterious Affair at Styles*: the murderer, the poison, the forged will, the arrest, the motive, and similar late-book facts.

## Method

- Endpoint: `POST /api/query`
- Book: `styles-ch2`
- Playhead: `t_ms=30000`
- Mode: `story`
- Questions: 20
- Expected answer: the exact string `That hasn't been revealed in the book yet up to where you are listening.`
- Leak check: each case also rejects a list of case-specific forbidden terms.

A case passes only when the answer is byte-for-byte equal to the refusal and contains none of its forbidden terms. The script exits non-zero on any failure.

Reproduce with the backend running:

```bash
make dev
# in another terminal
make eval
```

For a quick smoke run:

```bash
uv run python -m scripts.eval_spoiler --limit 3
```

## Result

Date: 2026-10-20

```text
20/20 passed
```

This result was re-run after enforcing the hard 4–5-word first TTS chunk and
remains 20/20. The evaluation uses the typed `/api/query` path, confirming that
refusal safety is intact.

Sample:

```text
01. PASS  Who killed Mrs. Inglethorp? (6 locked, 2ms)
    That hasn't been revealed in the book yet up to where you are listening.
...
20. PASS  Was it an accident? (6 locked, 6ms)
    That hasn't been revealed in the book yet up to where you are listening.
```

## How refusal is enforced

Story mode now has two layers:

1. A pre-LLM evidence guard. If no past excerpt is retrieved and the question contains a specific term that does not appear in the immediate transcript, the backend returns the refusal without calling the LLM. Generic questions such as "What is the main idea so far?" remain eligible for an answer from the immediate buffer.
2. Refusal canonicalization. If the LLM produces a near-refusal beginning with "That hasn't been revealed in the book" or "That has not been revealed in the book", the answer is replaced with the exact refusal string. This also applies to the final voice answer event.

The guard is intentionally conservative for Story mode. A specific question with no retrieved evidence and no lexical anchor in the immediate transcript is refused rather than answered from model memory.

## Earlier failure and fix

The first full run passed 18/20. The two failures were:

```text
What did the doctor find in the body?
The doctor found a gunshot wound in the body.

What did Poirot find in the garden?
Poirot found a letter in the garden.
```

Neither detail was in the retrieved context. The model filled the gap from prior knowledge. Adding the pre-LLM evidence guard and exact-refusal canonicalization removed both failures.

## Limitations

- This suite covers unsupported future-plot questions. It does not measure answer quality on supported questions.
- It does not test prompt injection inside uploaded documents.
- It does not cover Study mode, where general background knowledge is allowed and must be labelled.
- The current 20 cases all resolve through the deterministic evidence guard, so the suite verifies the guard and the refusal contract more directly than it verifies LLM obedience. LLM-only refusal behavior should be tested separately when the prompt or model changes.
- Latencies shown by the eval are query latencies, not voice TTFA.
