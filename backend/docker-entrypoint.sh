#!/bin/sh
set -e

PYTHONPATH=/app alembic upgrade head

exec "$@"
