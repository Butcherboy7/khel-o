#!/usr/bin/env bash
# Runs ON the EC2 instance via SSM RunShellScript — not locally.
# The repo is already synced to origin/<branch> by the SSM command that
# invokes this script (see .github/workflows/deploy.yml); that has to happen
# before this file exists in its latest form on disk, so it isn't repeated
# here.
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy_remote.sh <prod|dev>}"

case "$ENVIRONMENT" in
  prod)
    DIR=/opt/khelo-prod
    COMPOSE_FILE=docker-compose.prod.yml
    HEALTH_URL=https://khel-o.com/health
    ;;
  dev)
    DIR=/opt/khelo-dev
    COMPOSE_FILE=docker-compose.dev.yml
    HEALTH_URL=https://dev.khel-o.com/health
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT (expected prod or dev)" >&2
    exit 1
    ;;
esac

cd "$DIR"

echo "== docker build =="
docker compose -f "$COMPOSE_FILE" build backend frontend

echo "== alembic upgrade head =="
# Runs in a one-off container from the freshly built image, ahead of the
# cutover below, so this only ever applies additive/backward-compatible
# migrations against the still-running old containers.
docker compose -f "$COMPOSE_FILE" run --rm -e PYTHONPATH=/app backend \
  alembic upgrade head

echo "== cutover =="
docker compose -f "$COMPOSE_FILE" up -d backend frontend

echo "== cleanup build cache =="
docker builder prune -af >/dev/null

echo "== health check =="
sleep 5
curl -fsS "$HEALTH_URL"
echo
echo "Deploy OK ($ENVIRONMENT): $(git rev-parse --short HEAD)"
