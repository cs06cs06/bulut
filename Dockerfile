# EMA Lightning Seslendirici: Hugging Face Spaces, Render, Cloud Run vb. için CPU imajı.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/user \
    HF_HOME=/home/user/.cache/huggingface \
    PORT=7860

# Hugging Face Spaces kapsayıcıyı 1000 numaralı kullanıcıyla çalıştırır.
RUN useradd -m -u 1000 user
WORKDIR /home/user/app

# CUDA'sız torch imajı birkaç GB küçültür; model CPU'da gerçek zamandan hızlı çalışır.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch \
 && pip install -r requirements.txt

USER user
# Model ağırlıklarını (yaklaşık 34 MB) imaja göm: kapsayıcı açılışta indirme beklemez.
RUN python -c "from ema_lightning import EMA; EMA(device='cpu')"

COPY --chown=user tts_app ./tts_app

EXPOSE 7860
CMD ["sh", "-c", "exec uvicorn tts_app.server:app --host 0.0.0.0 --port ${PORT}"]
