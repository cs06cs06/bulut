"""Tek bir EMA modelini tüm uygulama boyunca paylaşır.

EMA iş parçacığı güvenlidir: Playhead zamanlayıcısı aynı anda gelen tüm istekleri
birlikte çalıştırır, bu yüzden programda tek bir örnek yeterlidir.
"""
import os
import threading

_lock = threading.Lock()
_tts = None


def get_tts():
    """Modeli ilk çağrıda yükler (ema.pt ve decoder.pt Hugging Face'ten indirilir)."""
    global _tts
    if _tts is None:
        with _lock:
            if _tts is None:
                from ema_lightning import EMA

                tts = EMA(device=os.environ.get("EMA_DEVICE", "auto"))
                if os.environ.get("EMA_LIGHTNING", "1") != "0" and tts.device.type == "cuda":
                    tts = tts.lightning()
                _tts = tts
    return _tts
