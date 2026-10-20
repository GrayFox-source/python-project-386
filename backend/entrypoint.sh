#!/bin/sh
set -eu

if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  export JWT_SECRET
  echo "JWT_SECRET is not set; generated a temporary secret." >&2
fi

uv run --frozen --no-dev alembic upgrade head

if [ -n "${HOST_EMAIL:-}" ] && [ -n "${HOST_PASSWORD:-}" ] && [ -n "${HOST_TIMEZONE:-}" ]; then
  uv run --frozen --no-dev python -m app.seed
else
  echo "HOST_EMAIL, HOST_PASSWORD and HOST_TIMEZONE are not set; skipping Host seed." >&2
fi

exec uv run --frozen --no-dev uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
