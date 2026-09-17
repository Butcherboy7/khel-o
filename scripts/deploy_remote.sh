#!/usr/bin/env bash
# Runs ON the production EC2 instance via SSM RunShellScript — not locally.
# The repo is already synced to origin/main by the SSM command that invokes
# this script (see .github/workflows/deploy.yml); that has to happen before
# this file exists in its latest form on disk, so it isn't repeated here.
set -euo pipefail

cd /opt/khelo

echo "== docker build =="
docker compose -f docker-compose.prod.yml build backend frontend

echo "== alembic upgrade head =="
# Runs in a one-off container from the freshly built image, ahead of the
# cutover below, so this only ever applies additive/backward-compatible
# migrations against the still-running old containers.
docker compose -f docker-compose.prod.yml run --rm -e PYTHONPATH=/app backend \
  alembic upgrade head

echo "== cutover =="
docker compose -f docker-compose.prod.yml up -d backend frontend

echo "== cleanup build cache =="
docker builder prune -af >/dev/null

echo "== health check =="
sleep 5
curl -fsS https://khel-o.com/health
echo
echo "Deploy OK: $(git rev-parse --short HEAD)"
