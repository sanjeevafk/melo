#!/usr/bin/env bash
# Bootstrap for container runs: works with the baked /app/data or with a fresh
# volume mounted over it (compose), restoring demo books and fetching models
# only when they are missing.
set -euo pipefail
cd /app

# Compose interpolation passes empty strings for unset vars; drop them so the
# in-app defaults (e.g. http://localhost:11434) still apply.
[ -n "${ECHOREAD_LLM_ENDPOINT:-}" ] || unset ECHOREAD_LLM_ENDPOINT
[ -n "${ECHOREAD_LLM_API_KEY:-}" ] || unset ECHOREAD_LLM_API_KEY

if [ -d /opt/demo-books ]; then
    mkdir -p data/books
    for book in /opt/demo-books/*; do
        name="$(basename "$book")"
        if [ ! -e "data/books/$name" ]; then
            cp -r "$book" "data/books/$name"
        fi
    done
fi

if [ ! -f data/models/manifest.json ]; then
    python -m scripts.fetch_models --profile cpu
fi

# A host-mounted volume can have a manifest but no fermion cache (the Phonon
# profile unpacks outside data/models); top it up when missing. No-op otherwise.
if ! python -c "from backend.app.services.stt import phonon_profile_installed; import sys; sys.exit(0 if phonon_profile_installed() else 1)" 2>/dev/null; then
    python -c "from scripts.fetch_models import download_phonon; download_phonon()"
fi

if [ ! -f data/melo.db ] && [ ! -f data/echoread.db ]; then
    python -m scripts.ingest_assets
fi

exec python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "${ECHOREAD_PORT:-8000}"
