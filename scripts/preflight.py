from __future__ import annotations

import argparse
import shutil
import socket
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from backend.app.config import settings
from backend.app.db import book_count, db_health

MIN_RAM_BYTES = 12 * 1024**3
MIN_DISK_BYTES = 5 * 1024**3
MIN_GPU_MEMORY_MIB = 10 * 1024


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, check=False)


def ram_bytes() -> int | None:
    meminfo = Path("/proc/meminfo")
    if not meminfo.exists():
        return None
    for line in meminfo.read_text().splitlines():
        if line.startswith("MemTotal:"):
            return int(line.split()[1]) * 1024
    return None


def check_python() -> Check:
    version = sys.version_info
    ok = (3, 11) <= (version.major, version.minor) < (3, 13)
    return Check("Python 3.11/3.12", ok, f"{version.major}.{version.minor}.{version.micro}")


def check_node() -> Check:
    binary = shutil.which("node")
    if not binary:
        return Check("Node 20+", False, "node not found")
    result = run([binary, "--version"])
    raw = result.stdout.strip().lstrip("v")
    try:
        major = int(raw.split(".")[0])
    except ValueError:
        major = 0
    return Check("Node 20+", result.returncode == 0 and major >= 20, raw or "unknown")


def check_ffmpeg() -> list[Check]:
    checks = []
    for name in ("ffmpeg", "ffprobe"):
        binary = shutil.which(name)
        checks.append(Check(name, binary is not None, binary or "not found"))
    return checks


def check_models() -> list[Check]:
    checks = [
        Check(
            "STT model",
            (settings.whisper_model_dir / "model.bin").exists(),
            str(settings.whisper_model_dir),
        ),
        Check(
            "Embedding model",
            (settings.embedding_model_dir / "config.json").exists()
            and (settings.embedding_model_dir / "model.safetensors").exists(),
            str(settings.embedding_model_dir),
        ),
        Check("LLM model", settings.llm_model_path.exists(), str(settings.llm_model_path)),
        Check(
            "Kokoro model",
            settings.kokoro_model_path.exists() and settings.kokoro_voices_path.exists(),
            str(settings.kokoro_model_path),
        ),
    ]
    return checks


def check_database() -> list[Check]:
    checks = [Check("SQLite", db_health(), str(settings.db_path))]
    if not db_health():
        return checks
    try:
        count = book_count()
        checks.append(Check("Demo books", count >= 2, f"{count} book(s)"))
        with sqlite3.connect(settings.db_path) as connection:
            rows = connection.execute(
                "SELECT id, audio_path FROM books ORDER BY id"
            ).fetchall()
        for book_id, audio_path in rows:
            path = settings.data_dir / audio_path
            checks.append(Check(f"Audio {book_id}", path.exists(), str(path)))
            checks.append(
                Check(
                    f"Source {book_id}",
                    (settings.book_dir(book_id) / "source.txt").exists(),
                    str(settings.book_dir(book_id) / "source.txt"),
                )
            )
            checks.append(
                Check(
                    f"Provenance {book_id}",
                    (settings.book_dir(book_id) / "provenance.json").exists(),
                    str(settings.book_dir(book_id) / "provenance.json"),
                )
            )
    except sqlite3.Error as error:
        checks.append(Check("SQLite query", False, str(error)))
    return checks


def check_fixture() -> Check:
    path = Path(__file__).resolve().parents[1] / "backend/app/tests/fixtures/question.wav"
    return Check("Benchmark fixture", path.exists(), str(path))


def check_port() -> Check:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((settings.host, settings.port))
        except OSError as error:
            return Check(f"Port {settings.port}", False, str(error))
    return Check(f"Port {settings.port}", True, "free")


def check_resources() -> list[Check]:
    checks = []
    total_ram = ram_bytes()
    if total_ram is None:
        checks.append(Check("RAM", False, "could not determine"))
    else:
        checks.append(
            Check(
                "RAM",
                total_ram >= MIN_RAM_BYTES,
                f"{total_ram / 1024**3:.1f} GiB",
            )
        )
    free = shutil.disk_usage(settings.data_dir).free
    checks.append(Check("Disk", free >= MIN_DISK_BYTES, f"{free / 1024**3:.1f} GiB free"))
    return checks


def check_gpu() -> list[Check]:
    if not settings.is_gpu:
        return []
    checks = []
    binary = shutil.which("nvidia-smi")
    if not binary:
        return [Check("NVIDIA GPU", False, "nvidia-smi not found")]
    result = run(
        [
            binary,
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ]
    )
    if result.returncode != 0:
        checks.append(Check("NVIDIA GPU", False, result.stderr.strip()))
        return checks
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        checks.append(Check("NVIDIA GPU", False, "no GPU reported"))
        return checks
    name, memory = lines[0].split(",", 1)
    try:
        memory_mib = int(memory.strip())
    except ValueError:
        memory_mib = 0
    checks.append(
        Check(
            "GPU memory",
            memory_mib >= MIN_GPU_MEMORY_MIB,
            f"{name.strip()} {memory_mib} MiB",
        )
    )
    try:
        import ctranslate2

        count = ctranslate2.get_cuda_device_count()
        checks.append(Check("CTranslate2 CUDA", count > 0, f"{count} device(s)"))
    except Exception as error:
        checks.append(Check("CTranslate2 CUDA", False, str(error)))
    try:
        import torch

        available = torch.cuda.is_available()
        checks.append(
            Check("Torch CUDA", available, "bfloat16" if available else "unavailable")
        )
    except Exception as error:
        checks.append(Check("Torch CUDA", False, str(error)))
    try:
        from llama_cpp import llama_supports_gpu_offload

        checks.append(
            Check("llama.cpp GPU", llama_supports_gpu_offload(), "offload support")
        )
    except Exception as error:
        checks.append(Check("llama.cpp GPU", False, str(error)))
    return checks


def main() -> int:
    argparse.ArgumentParser(description="Check EchoRead prerequisites").parse_args()
    settings.ensure_directories()
    checks = [
        check_python(),
        check_node(),
        *check_ffmpeg(),
        *check_models(),
        *check_database(),
        check_fixture(),
        check_port(),
        *check_resources(),
        *check_gpu(),
    ]
    for check in checks:
        marker = "PASS" if check.ok else "FAIL"
        print(f"[{marker}] {check.name}: {check.detail}")
    failures = [check for check in checks if not check.ok]
    if failures:
        print(f"\n{len(failures)} check(s) failed.")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
