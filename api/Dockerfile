# syntax=docker/dockerfile:1
FROM python:3.12-slim

# MODEL_DIR: where ops/remove_bg.py finds the model (baked in below).
# PIP_DEFAULT_TIMEOUT: the wheels are large; don't give up on a slow link.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=60 \
    MODEL_DIR=/models

WORKDIR /app

# Bake the u2netp model (4.7 MB, checksum-verified) into the image so no
# request ever downloads it. Keep the hash in step with MODEL_SHA256 in
# ops/remove_bg.py. ADD saves it owner-only; let the app user read it. (Not
# ADD --chmod: that also applies to /models itself, which then can't be entered.)
ADD --checksum=sha256:309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8 \
    https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx /models/u2netp.onnx
RUN chmod -R a+rX /models

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 app
USER app

# Railway sets PORT; default to 8000 for `docker run`. One worker: each worker is
# a process with its own copy of the model, and the free tier's memory is tight.
# Explicit so a WEB_CONCURRENCY env var can't raise it.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
