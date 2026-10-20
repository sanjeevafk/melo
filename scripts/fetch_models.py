from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download, snapshot_download

from backend.app.config import settings

EMBEDDING_REVISION = "914f7f89142e33e77833254d9c9b90c3cef7303b"
HASHES_PATH = Path(__file__).resolve().with_name("model_hashes.json")

WHISPER_MODELS = {
    "base": ("Systran/faster-whisper-base.en", "faster-whisper-base.en"),
    "small": ("Systran/faster-whisper-small.en", "faster-whisper-small.en"),
}
QWEN_MODELS = {
    "1.5b": ("Qwen/Qwen2.5-1.5B-Instruct-GGUF", "qwen2.5-1.5b-instruct-q4_k_m.gguf"),
    "3b": ("Qwen/Qwen2.5-3B-Instruct-GGUF", "qwen2.5-3b-instruct-q4_k_m.gguf"),
}
KOKORO_FILES = {
    "kokoro-v1.0.int8.onnx": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
        "model-files-v1.0/kokoro-v1.0.int8.onnx"
    ),
    "voices-v1.0.bin": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
        "model-files-v1.0/voices-v1.0.bin"
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def model_files() -> list[Path]:
    files = []
    for path in sorted(settings.models_dir.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(settings.models_dir)
        if relative.parts and relative.parts[0] == ".cache":
            continue
        if relative.name == "manifest.json":
            continue
        files.append(relative)
    return files


def load_hashes() -> dict:
    if not HASHES_PATH.exists():
        return {"version": 1, "files": {}}
    return json.loads(HASHES_PATH.read_text())


def write_hashes(files: list[Path]) -> None:
    payload = {
        "version": 1,
        "files": {
            str(relative): {"sha256": sha256(settings.models_dir / relative)}
            for relative in files
        },
    }
    HASHES_PATH.write_text(json.dumps(payload, indent=2) + "\n")


def verify_hashes(files: list[Path], update: bool) -> None:
    stored = load_hashes()
    known = stored.get("files", {})
    if update or not known:
        write_hashes(files)
        print(f"Wrote {HASHES_PATH.relative_to(Path.cwd())} with {len(files)} file hashes.")
        return
    failures = []
    for relative in files:
        expected = known.get(str(relative))
        if not expected:
            failures.append(f"{relative}: no pinned hash")
            continue
        actual = sha256(settings.models_dir / relative)
        expected_hash = expected["sha256"] if isinstance(expected, dict) else expected
        if actual != expected_hash:
            failures.append(f"{relative}: expected {expected_hash}, got {actual}")
    if failures:
        raise SystemExit(
            "Model hash verification failed:\n  "
            + "\n  ".join(failures)
            + "\nRun with --update-hashes only after reviewing the downloaded files."
        )
    print(f"Verified {len(files)} model files.")


def download_snapshot(repo_id: str, target: Path, revision: str | None = None) -> None:
    print(f"Downloading {repo_id} -> {target}")
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=repo_id,
        revision=revision,
        local_dir=target,
    )


def download_qwen(key: str, force: bool) -> None:
    repo_id, filename = QWEN_MODELS[key]
    target = settings.models_dir / filename
    if target.exists() and not force:
        print(f"Keeping {target}")
        return
    api = HfApi()
    candidates = [
        name
        for name in api.list_repo_files(repo_id)
        if name.lower().endswith(".gguf") and "q4_k_m" in name.lower()
    ]
    if not candidates:
        raise SystemExit(f"No Q4_K_M GGUF found in {repo_id}")
    source_name = sorted(candidates)[0]
    source = Path(hf_hub_download(repo_id=repo_id, filename=source_name))
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    print(f"Wrote {target}")


def download_kokoro(force: bool) -> None:
    for filename, url in KOKORO_FILES.items():
        target = settings.models_dir / filename
        if target.exists() and not force:
            print(f"Keeping {target}")
            continue
        temporary = target.with_suffix(target.suffix + ".part")
        print(f"Downloading {url}")
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        temporary.replace(target)
        print(f"Wrote {target}")


def required_files(profile: str) -> list[Path]:
    required = [
        settings.models_dir / "faster-whisper-base.en/model.bin",
        settings.models_dir / "embeddinggemma-2/config.json",
        settings.models_dir / "embeddinggemma-2/model.safetensors",
        settings.models_dir / "kokoro-v1.0.int8.onnx",
        settings.models_dir / "voices-v1.0.bin",
    ]
    if profile in {"cpu", "all"}:
        required.append(settings.models_dir / "qwen2.5-1.5b-instruct-q4_k_m.gguf")
    if profile in {"gpu", "all"}:
        required.append(settings.models_dir / "faster-whisper-small.en/model.bin")
        required.append(settings.models_dir / "qwen2.5-3b-instruct-q4_k_m.gguf")
    return required


def write_manifest(profile: str) -> None:
    files = model_files()
    payload = {
        "created_at": datetime.now(UTC).isoformat(),
        "profile": profile,
        "embedding_revision": EMBEDDING_REVISION,
        "files": {
            str(relative): {
                "sha256": sha256(settings.models_dir / relative),
                "size": (settings.models_dir / relative).stat().st_size,
            }
            for relative in files
        },
    }
    settings.model_manifest_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {settings.model_manifest_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch and verify EchoRead models")
    parser.add_argument("--profile", choices=["cpu", "gpu", "all"], default="all")
    parser.add_argument("--verify", action="store_true", help="verify without downloading")
    parser.add_argument("--force", action="store_true", help="redownload existing files")
    parser.add_argument("--update-hashes", action="store_true", help="replace pinned hashes")
    args = parser.parse_args()

    settings.ensure_directories()
    if not args.verify:
        if args.profile in {"cpu", "all"}:
            repo_id, dirname = WHISPER_MODELS["base"]
            download_snapshot(repo_id, settings.models_dir / dirname)
            download_qwen("1.5b", args.force)
        if args.profile in {"gpu", "all"}:
            repo_id, dirname = WHISPER_MODELS["small"]
            download_snapshot(repo_id, settings.models_dir / dirname)
            download_qwen("3b", args.force)
        download_snapshot(
            "google/embeddinggemma-2",
            settings.models_dir / "embeddinggemma-2",
            revision=EMBEDDING_REVISION,
        )
        download_kokoro(args.force)

    missing = [path for path in required_files(args.profile) if not path.exists()]
    if missing:
        for path in missing:
            print(f"Missing: {path}", file=sys.stderr)
        return 1

    files = model_files()
    verify_hashes(files, args.update_hashes)
    write_manifest(args.profile)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
