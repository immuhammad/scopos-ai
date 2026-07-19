import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import AUDIO_DIR, CORS_ORIGINS
from app.db import init_db
from app.routers import deals, founders, misc
from app.schemas import HealthResponse

app = FastAPI(title="VC Brain API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

app.include_router(deals.router)
app.include_router(founders.router)
app.include_router(misc.router)


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")
