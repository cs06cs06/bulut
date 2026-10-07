import io
import wave
from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient

from tts_app.audio import to_pcm16, to_wav
from tts_app.server import create_app


class FakeTTS:
    """Gerçek modeli indirmeden uç noktaları test etmek için sahte EMA."""

    device = "cpu"

    def say(self, text, speed=1.0, seed=None, sample_rate=48000):
        audio = np.linspace(-1, 1, sample_rate // 10, dtype=np.float32)
        return SimpleNamespace(audio=audio, sample_rate=sample_rate, duration=len(audio) / sample_rate, seed=seed or 7)

    def stream(self, text, speed=1.0, seed=None, sample_rate=48000):
        yield np.full(100, 0.5, dtype=np.float32)
        yield np.full(50, -0.5, dtype=np.float32)


client = TestClient(create_app(tts_factory=lambda: FakeTTS(), preload=False))


def test_index():
    r = client.get("/")
    assert r.status_code == 200 and "EMA Lightning" in r.text


def test_say_returns_wav():
    r = client.post("/api/say", json={"text": "Merhaba", "seed": 3, "sample_rate": 24000})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    assert r.headers["x-seed"] == "3"
    with wave.open(io.BytesIO(r.content)) as w:
        assert w.getframerate() == 24000 and w.getnchannels() == 1 and w.getnframes() == 2400


def test_stream_returns_pcm():
    r = client.post("/api/stream", json={"text": "Merhaba"})
    assert r.status_code == 200 and r.headers["x-sample-rate"] == "48000"
    pcm = np.frombuffer(r.content, dtype="<i2")
    assert len(pcm) == 150 and pcm[0] == 16384 and pcm[-1] == -16384


def test_validation():
    assert client.post("/api/say", json={"text": "   "}).status_code == 422
    assert client.post("/api/say", json={"text": "a", "speed": 5}).status_code == 422
    assert client.post("/api/say", json={"text": "a", "sample_rate": 44100}).status_code == 422
    assert client.post("/api/say", json={"text": "a", "seed": -1}).status_code == 422
    assert client.post("/api/say", json={"text": "a" * 5001}).status_code == 422


def test_pcm_clips():
    assert np.frombuffer(to_pcm16(np.array([2.0, -2.0], dtype=np.float32)), "<i2").tolist() == [32767, -32767]
    assert to_wav(np.zeros(10, dtype=np.float32), 8000)[:4] == b"RIFF"
