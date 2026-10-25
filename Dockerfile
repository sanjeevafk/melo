# syntax=docker/dockerfile:1

# EchoRead/Melo production image: FastAPI serves both the API and the built SPA.
# Models, the ingested demo database, and the committed demo books are baked in
# so a cold container is fully self-contained (no network fetch at startup).

# ---- Web bundle -------------------------------------------------------------
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Python deps + model prefetch (toolchain-heavy, thrown away) ------------
FROM python:3.12-slim AS pydeps
# llama-cpp-python ships sdist-only on PyPI: needs a C++ toolchain + cmake.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_CACHE_DIR=/root/.cache/uv \
    HF_HOME=/app/data/hf-cache \
    FERMION_CACHE_DIR=/app/data/fermion-cache

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Model weights (whisper, Qwen GGUF, EmbeddingGemma, Kokoro, Phonon, indra-ocr)
# land in /app/data and the package caches under HF home — all copied to the
# runtime stage below. Only stt.py is copied from services/ so that backend
# code changes don't invalidate this (multi-GB) layer; fetch_models checks
# phonon_profile_installed() from it.
COPY scripts/ scripts/
COPY backend/__init__.py backend/__init__.py
COPY backend/app/__init__.py backend/app/__init__.py
COPY backend/app/config.py backend/app/config.py
COPY backend/app/services/__init__.py backend/app/services/__init__.py
COPY backend/app/services/stt.py backend/app/services/stt.py
# Drop the HF staging duplicates afterwards — each payload is copied out of
# <model>/.cache into place, so the staging copy doubles the image weight.
# Also drop Qwen from hf-cache (hf_hub_download stages into HF_HOME before
# copying to data/models, duplicating the 1.1GB GGUF).
RUN python -m scripts.fetch_models --profile cpu \
    && find data/models -depth -type d -name .cache -exec rm -rf {} + \
    && rm -rf /app/data/hf-cache/hub/models--Qwen* \
    && find /app/data/hf-cache/hub/blobs -type f -size +500M -delete \
    && rm -rf /app/data/cache

# ---- Runtime ----------------------------------------------------------------
FROM python:3.12-slim AS runtime
# ffmpeg/ffprobe: audio ingest + chapter detection. libgomp1: torch, ctranslate2
# and onnxruntime. libsndfile1: soundfile.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgomp1 libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 echoread
WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH" \
    HF_HOME=/app/data/hf-cache \
    XDG_CACHE_HOME=/app/data/cache \
    FERMION_CACHE_DIR=/app/data/fermion-cache \
    ECHOREAD_PROFILE=cpu \
    ECHOREAD_HOST=0.0.0.0 \
    ECHOREAD_LLM_PROVIDER=llama_cpp

RUN mkdir -p /app/data/models && chown -R 1000:1000 /app/data

COPY --from=pydeps /app/.venv /app/.venv
# Split model & cache layers to avoid giant single-layer limits in Container Apps
COPY --from=pydeps --chown=1000:1000 /app/data/models/embeddinggemma-2 /app/data/models/embeddinggemma-2
COPY --from=pydeps --chown=1000:1000 /app/data/models/qwen2.5-1.5b-instruct-q4_k_m.gguf /app/data/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
COPY --from=pydeps --chown=1000:1000 /app/data/models/faster-whisper-base.en /app/data/models/faster-whisper-base.en
COPY --from=pydeps --chown=1000:1000 /app/data/models/kokoro-v1.0.int8.onnx /app/data/models/kokoro-v1.0.int8.onnx
COPY --from=pydeps --chown=1000:1000 /app/data/models/voices-v1.0.bin /app/data/models/voices-v1.0.bin
COPY --from=pydeps --chown=1000:1000 /app/data/models/manifest.json /app/data/models/manifest.json
COPY --from=pydeps --chown=1000:1000 /app/data/fermion-cache /app/data/fermion-cache
COPY --from=pydeps --chown=1000:1000 /app/data/hf-cache /app/data/hf-cache
COPY --from=web /app/web/dist /app/web/dist
COPY backend/ backend/
COPY scripts/ scripts/
# Demo books are staged outside /app/data; the entrypoint restores them on
# boot so mounted volumes and fresh containers always get user-owned files.
COPY data/books/ /opt/demo-books/
COPY Makefile docker-entrypoint.sh ./

# Ingest the demo books now, then remove them — they live on in /opt/demo-books.
# Runs as echoread so the baked DB is writable at runtime (SQLite needs write
# access to its file).
USER echoread
RUN mkdir -p data/books \
    && cp -r /opt/demo-books/. data/books/ \
    && python -m scripts.ingest_assets \
    && rm -rf data/books data/demo_cache
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["./docker-entrypoint.sh"]
