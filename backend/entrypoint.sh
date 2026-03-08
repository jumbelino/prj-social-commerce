#!/bin/sh
set -eu

attempt=0
max_attempts=30

until alembic upgrade head; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Failed to apply migrations after ${max_attempts} attempts" >&2
    exit 1
  fi
  sleep 2
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
