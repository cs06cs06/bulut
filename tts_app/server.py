"""Web sunucusu: arayüz, tek parça WAV ve akışlı (streaming) PCM uç noktaları.

Çalıştırma:  uvicorn tts_app.server:app --host 0.0.0.0 --port 8000
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from .audio import to_pcm16, to_wav
from .engine import get_tts

STATIC = Path(__file__).parent / "static"
SAMPLE_RATES = (48000, 24000, 16000, 8000)
MAX_CHARS = 5000


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    speed: float = Field(1.0, ge=0.25, le=4.0)
    seed: int | None = Field(None, ge=0)
    sample_rate: int = 48000

    @field_validator("text")
    @classmethod
    def not_blank(cls, text):
        if not text.strip():
            raise ValueError("metin boş olamaz")
        return text

    @field_validator("sample_rate")
    @classmethod
    def known_rate(cls, rate):
        if rate not in SAMPLE_RATES:
            raise ValueError(f"örnekleme hızı şunlardan biri olmalı: {SAMPLE_RATES}")
        return rate


def create_app(tts_factory=get_tts, preload=True):
    @asynccontextmanager
    async def lifespan(app):
        if preload:
            tts_factory()  # ilk isteğin model yüklemesini beklememesi için
        yield

    app = FastAPI(title="EMA Lightning TTS", lifespan=lifespan)

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/api/health")
    def health():
        tts = tts_factory()
        return {"status": "ok", "device": str(tts.device)}

    @app.post("/api/say")
    def say(req: SpeechRequest):
        """Metnin tamamını seslendirir ve bir WAV dosyası döndürür."""
        speech = tts_factory().say(req.text, speed=req.speed, seed=req.seed, sample_rate=req.sample_rate)
        return Response(
            to_wav(speech.audio, speech.sample_rate),
            media_type="audio/wav",
            headers={
                "X-Seed": str(speech.seed),
                "X-Duration": f"{speech.duration:.3f}",
                "Content-Disposition": 'inline; filename="konusma.wav"',
            },
        )

    @app.post("/api/stream")
    def stream(req: SpeechRequest):
        """Ses üretildikçe ham 16 bit mono PCM parçaları gönderir (ilk parça yaklaşık 1 saniye)."""
        chunks = tts_factory().stream(req.text, speed=req.speed, seed=req.seed, sample_rate=req.sample_rate)

        def body():
            try:
                for chunk in chunks:
                    if len(chunk):
                        yield to_pcm16(chunk)
            finally:
                close = getattr(chunks, "close", None)
                if close:  # istemci ayrılırsa kalan iş bırakılır
                    close()

        return StreamingResponse(
            body(),
            media_type="application/octet-stream",
            headers={"X-Sample-Rate": str(req.sample_rate), "X-Audio-Format": "pcm_s16le"},
        )

    return app


app = create_app()
