from __future__ import annotations

import argparse
import contextlib
import json
import math
import platform
import statistics
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "backend" / "app" / "tests" / "fixtures" / "question.wav"
GATES_MS = {
    "gpu": (1200, 1500),
    "cpu": (3000, 4000),
}
STAGES = ("stt_ms", "retrieval_ms", "llm_first_token_ms", "tts_first_sentence_ms", "total_ms")

NOVEL_CASES = (
    ("Who arrived at Styles Court?", 45_000),
    ("Why was the narrator invited?", 60_000),
    ("What does John Cavendish do?", 75_000),
    ("Where did Hastings meet John?", 90_000),
    ("What did Evelyn Howard say?", 105_000),
)


def prepare_novel_fixtures() -> list[tuple[Path, int, str]]:
    from backend.app.services.tts import get_tts

    tts = get_tts()
    fixtures: list[tuple[Path, int, str]] = []
    for question, t_ms in NOVEL_CASES:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            handle.write(tts.wav_bytes(question))
            handle.flush()
            fixtures.append((Path(handle.name), t_ms, question))
    return fixtures


def cleanup_fixtures(fixtures: list[tuple[Path, int, str]]) -> None:
    for path, _, _ in fixtures:
        with contextlib.suppress(OSError):
            path.unlink(missing_ok=True)


def percentile(values: list[int], fraction: float) -> float:
    if not values:
        raise ValueError("No values")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def fetch_health(client: httpx.Client, base_url: str) -> dict[str, object]:
    response = client.get(f"{base_url}/api/health")
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("Health response was not a JSON object")
    return payload


def run_once(
    client: httpx.Client,
    base_url: str,
    fixture: Path,
    book_id: str,
    t_ms: int,
    mode: str,
) -> tuple[dict[str, int], float]:
    timings: dict[str, int] | None = None
    error: str | None = None
    started = datetime.now(UTC)
    with fixture.open("rb") as audio:
        files = {"audio": (fixture.name, audio, "audio/wav")}
        data = {"book_id": book_id, "t_ms": str(t_ms), "mode": mode}
        with client.stream(
            "POST",
            f"{base_url}/api/voice-query",
            files=files,
            data=data,
            timeout=httpx.Timeout(300.0, connect=10.0),
        ) as response:
            if response.status_code != 200:
                response.read()
                raise RuntimeError(
                    f"voice-query returned {response.status_code}: {response.text[:300]}"
                )
            for line in response.iter_lines():
                if not line.strip():
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"Malformed NDJSON event: {line[:120]}") from exc
                if event.get("type") == "timings":
                    timings = {stage: int(event.get(stage, 0)) for stage in STAGES}
                elif event.get("type") == "error":
                    error = str(event.get("message") or event.get("code") or "voice error")
    wall_ms = (datetime.now(UTC) - started).total_seconds() * 1000
    if error:
        raise RuntimeError(error)
    if timings is None:
        raise RuntimeError("voice-query did not emit a timings event")
    if timings["total_ms"] <= 0:
        timings["total_ms"] = sum(timings[stage] for stage in STAGES[:-1])
    return timings, wall_ms


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure Melo voice TTFA through the API.")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Running backend URL")
    parser.add_argument("--book", default="styles-ch2", help="Book id used for retrieval")
    parser.add_argument("--t-ms", type=int, default=60_000, help="Fixed playback position")
    parser.add_argument("--mode", choices=("story", "study"), default="story")
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument(
        "--warmup",
        type=int,
        default=1,
        help="Unrecorded requests used to load lazy models (default: 1)",
    )
    parser.add_argument(
        "--novel",
        action="store_true",
        help="Rotate across distinct novel questions to bypass prompt-cache effects",
    )
    parser.add_argument(
        "--cold",
        action="store_true",
        help="Report cold performance without unrecorded warm-up requests",
    )
    parser.add_argument("--assert", dest="assert_gate", action="store_true")
    args = parser.parse_args()

    if args.cold:
        args.warmup = 0

    if args.runs < 1:
        parser.error("--runs must be at least 1")
    if args.warmup < 0:
        parser.error("--warmup must be non-negative")
    if not args.fixture.exists():
        parser.error(f"Fixture not found: {args.fixture}")

    base_url = args.url.rstrip("/")
    with httpx.Client(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
        try:
            health = fetch_health(client, base_url)
        except (httpx.HTTPError, OSError) as exc:
            print(f"Cannot reach the backend at {base_url}: {exc}", file=sys.stderr)
            print("Start it with: make dev", file=sys.stderr)
            return 2
        if not health.get("ready"):
            print(f"Backend is not ready: {health}", file=sys.stderr)
            print(
                "Wait for /api/health to report ready, or run make models first.",
                file=sys.stderr,
            )
            return 2
        profile = str(health.get("profile", "cpu"))
        if profile not in GATES_MS:
            print(f"Unknown profile from /api/health: {profile}", file=sys.stderr)
            return 2

        novel_fixtures: list[tuple[Path, int, str]] = []
        if args.novel:
            print("Synthesizing novel audio questions…", flush=True)
            novel_fixtures = prepare_novel_fixtures()

        try:
            print(
                f"Melo latency benchmark · {datetime.now(UTC).date().isoformat()} · "
                f"{profile.upper()} · {platform.platform()}"
            )
            mode_desc = f"novel ({len(novel_fixtures)}q)" if args.novel else "standard"
            cold_desc = " [COLD]" if args.cold else ""
            print(
                f"Book={args.book} mode={args.mode} bench={mode_desc}{cold_desc} runs={args.runs}"
            )

            for index in range(args.warmup):
                print(f"Warm-up {index + 1}/{args.warmup}…", flush=True)
                fixture = novel_fixtures[0][0] if novel_fixtures else args.fixture
                t_ms = novel_fixtures[0][1] if novel_fixtures else args.t_ms
                try:
                    run_once(
                        client,
                        base_url,
                        fixture,
                        args.book,
                        t_ms,
                        args.mode,
                    )
                except (httpx.HTTPError, RuntimeError, OSError) as exc:
                    print(f"Warm-up failed: {exc}", file=sys.stderr)
                    return 2

            samples: list[dict[str, int]] = []
            walls: list[float] = []
            for index in range(args.runs):
                if novel_fixtures:
                    fixture, t_ms, question_label = novel_fixtures[index % len(novel_fixtures)]
                    tag = f" [{question_label}]"
                else:
                    fixture, t_ms = args.fixture, args.t_ms
                    tag = ""
                try:
                    timings, wall_ms = run_once(
                        client,
                        base_url,
                        fixture,
                        args.book,
                        t_ms,
                        args.mode,
                    )
                except (httpx.HTTPError, RuntimeError, OSError) as exc:
                    print(f"Run {index + 1} failed: {exc}", file=sys.stderr)
                    return 2
                samples.append(timings)
                walls.append(wall_ms)
                stage_summary = "  ".join(
                    f"{stage.removesuffix('_ms')}={timings[stage]}" for stage in STAGES
                )
                print(f"Run {index + 1:02d}/{args.runs}{tag}: {stage_summary} wall={wall_ms:.0f}ms")
        finally:
            if novel_fixtures:
                cleanup_fixtures(novel_fixtures)

    print("\nStage             p50       p95")
    print("----------------  --------  --------")
    for stage in STAGES:
        values = [sample[stage] for sample in samples]
        print(
            f"{stage.removesuffix('_ms'):<16}  {percentile(values, 0.5):>7.0f}ms  "
            f"{percentile(values, 0.95):>7.0f}ms"
        )
    print(f"wall (HTTP)        {percentile(walls, 0.5):>7.0f}ms  {percentile(walls, 0.95):>7.0f}ms")
    mean = statistics.fmean(sample["total_ms"] for sample in samples)
    print(f"mean TTFA          {mean:>7.0f}ms")

    p50 = percentile([sample["total_ms"] for sample in samples], 0.5)
    p95 = percentile([sample["total_ms"] for sample in samples], 0.95)
    target_p50, target_p95 = GATES_MS[profile]
    passed = p50 <= target_p50 and p95 <= target_p95
    print(
        f"\nGate ({profile}): p50 <= {target_p50}ms, p95 <= {target_p95}ms · "
        f"{'PASS' if passed else 'FAIL'}"
    )
    if args.assert_gate and not passed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
