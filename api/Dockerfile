FROM python:3.12-slim

# U2NET_HOME: where rembg keeps models (baked in below).
# NUMBA_CACHE_DIR: pymatting (a rembg dependency) caches compiled code, and
# site-packages isn't writable by the app user.
# PIP_DEFAULT_TIMEOUT: the wheels are large; don't give up on a slow link.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=60 \
    U2NET_HOME=/models \
    NUMBA_CACHE_DIR=/tmp/numba-cache

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Bake the u2netp model (4.7 MB, checksum-verified by rembg) into the image so
# no request ever downloads it. It's saved owner-only; let the app user read it.
RUN python -c "from rembg import new_session; new_session('u2netp')" \
    && chmod -R a+rX /models

COPY . .

RUN useradd --create-home --uid 10001 app
USER app

# Railway sets PORT; default to 8000 for `docker run`. One worker: each worker is
# a process with its own copy of the model, and the free tier's memory is tight.
# Explicit so a WEB_CONCURRENCY env var can't raise it.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
