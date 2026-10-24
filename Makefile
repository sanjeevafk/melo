SHELL := /bin/bash
UV ?= uv
PYTHON ?= $(UV) run python
BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000

.PHONY: setup models assets ingest dev check bench bench-gate bench-novel bench-cold e2e demo preflight eval format

setup:
	$(UV) sync
	cd web && npm install

models:
	$(PYTHON) -m scripts.fetch_models

assets:
	$(PYTHON) -m scripts.build_demo_assets
	$(PYTHON) -m scripts.ingest_assets

ingest:
	$(PYTHON) -m scripts.ingest_assets

dev:
	@set -e; \
	$(PYTHON) -m uvicorn backend.app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT) & \
	backend_pid=$$!; \
	trap 'kill $$backend_pid 2>/dev/null || true' EXIT INT TERM; \
	cd web && npm run dev

check:
	$(UV) run ruff check backend scripts
	$(PYTHON) -m pytest
	cd web && npm run lint
	cd web && npm run typecheck
	cd web && npm run test -- --run

bench:
	$(PYTHON) -m scripts.bench_latency

bench-gate:
	$(PYTHON) -m scripts.bench_latency --assert

bench-novel:
	$(PYTHON) -m scripts.bench_latency --novel

bench-cold:
	$(PYTHON) -m scripts.bench_latency --cold --runs 1

e2e:
	cd web && npm run e2e

demo: preflight
	$(MAKE) dev

preflight:
	$(PYTHON) -m scripts.preflight

eval:
	$(PYTHON) -m scripts.eval_spoiler

format:
	$(UV) run ruff format backend scripts
	cd web && npm run format
