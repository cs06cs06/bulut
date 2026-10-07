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
                batch_size = os.environ.get("EMA_BATCH_SIZE") or ("2" if tts.device.type == "cpu" else None)
                if batch_size:
                    # EMA en iyi toplu iş boyutunu ilk çağrıda 1–8 kopyalık denemelerle ölçer. CPU'da bu
                    # ölçüm ~20 sn sürer ve ~600 MB ek bellek ister; 512 MB'lık sunucuda kapsayıcıyı öldürür.
                    tts._batch_size = int(batch_size)
                if os.environ.get("EMA_LIGHTNING", "1") != "0" and tts.device.type == "cuda":
                    tts = tts.lightning(batch_size=int(batch_size) if batch_size else None)
                _tts = tts
    return _tts
