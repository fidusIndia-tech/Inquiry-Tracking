"""
main.py
-------
FastAPI application entry point.
"""

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from api.routes import router
from config import get_settings

settings = get_settings()

app = FastAPI(
    title="Gmail Processor",
    description="OAuth + Celery-backed Gmail processing service",
    version="1.0.0",
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
    https_only=False,
)

app.include_router(router)