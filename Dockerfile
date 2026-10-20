FROM node:20-alpine AS frontend

WORKDIR /app/frontend

COPY frontend/ ./
COPY api-spec/openapi.yaml /app/api-spec/openapi.yaml

RUN npm ci
RUN npm run build

FROM python:3.14-slim AS backend

COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/ ./
COPY api-spec/openapi.yaml /app/api-spec/openapi.yaml

RUN uv sync --frozen
RUN mkdir -p generated && uv run datamodel-codegen \
    --input /app/api-spec/openapi.yaml \
    --output generated/models.py \
    --input-file-type openapi \
    --output-model-type pydantic_v2.BaseModel \
    --openapi-scopes schemas \
    --target-python-version 3.14 \
    --formatters builtin \
    --use-standard-collections \
    --use-union-operator \
    --use-annotated \
    --disable-timestamp
RUN uv sync --frozen --no-dev

COPY --from=frontend /app/frontend/dist ./static

ENV PORT=8000

EXPOSE 8000

RUN chmod +x entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health')"

CMD ["sh", "./entrypoint.sh"]
