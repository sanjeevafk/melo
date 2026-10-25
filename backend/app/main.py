from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app.config import REPO_ROOT, settings
from backend.app.db import init_db
from backend.app.errors import ApiError
from backend.app.routers import books, health, query, tts, upload, voice

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("melo")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.ensure_directories()
    try:
        init_db()
        logger.info("SQLite ready at %s", settings.db_path)
    except Exception:
        logger.exception("SQLite initialization failed")
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="Melo",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )

    application.include_router(health.router)
    application.include_router(books.router)
    application.include_router(query.router)
    application.include_router(tts.router)
    application.include_router(upload.router)
    application.include_router(voice.router)
    application.mount(
        "/media/books",
        StaticFiles(directory=str(settings.books_dir)),
        name="media",
    )
    dist_dir = REPO_ROOT / "web" / "dist"
    if dist_dir.exists():
        application.mount(
            "/",
            StaticFiles(directory=str(dist_dir), html=True),
            name="spa",
        )
    return application


app = create_app()
