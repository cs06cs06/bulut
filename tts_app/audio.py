"""Ses dönüşümleri: float32 [-1, 1] -> 16 bit PCM ve WAV."""
import io
import wave

import numpy as np


def to_pcm16(audio: np.ndarray) -> bytes:
    """float32 [-1, 1] mono sesi küçük-sonlu (little-endian) 16 bit PCM baytlarına çevirir."""
    clipped = np.clip(np.asarray(audio, dtype=np.float32), -1.0, 1.0)
    return (clipped * 32767.0).round().astype("<i2").tobytes()


def to_wav(audio: np.ndarray, sample_rate: int) -> bytes:
    """float32 mono sesi tek parça bir WAV dosyasının baytlarına çevirir."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(to_pcm16(audio))
    return buffer.getvalue()
