# The study site: the static app built from the wiki, plus the progress server.
#
# Everything is built inside the image, so the build never writes into the
# host checkout. Only _site/ and server/ reach the final image.
#
#   docker compose up --build        # see docker-compose.yml

# python:3.12-slim, pinned by digest (multi-platform index).
ARG PYTHON_IMAGE=python:3.12-slim@sha256:cb33f7f771ecec2ef1225cf39b159591a040391bd73e4c01f00fdfc4c47611d2

FROM ${PYTHON_IMAGE} AS build
# git reads the history for each card's "added" date.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
ENV PYTHONDONTWRITEBYTECODE=1
RUN git config --global --add safe.directory /src \
    && python3 scripts/validate.py \
    && python3 scripts/build_flashcards.py

FROM ${PYTHON_IMAGE}
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SITE_DIR=/app/_site \
    PROGRESS_DB=/data/progress.db \
    PROGRESS_BACKUP_DIR=/data/backups
WORKDIR /app
COPY --from=build /src/_site /app/_site
COPY server/ /app/server/
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]
CMD ["python3", "/app/server/progress_server.py"]
