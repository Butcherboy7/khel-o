#!/bin/bash
# Deploy the current commit to DEV without GitHub Actions (billing-blocked): ship a git bundle over SSM.
#   bash scripts/ops/deploy_dev.sh <N>      e.g. 65  (previous deploy was prod64)
# Before running: tests green, `next build` passes, work committed. For a new alembic migration,
# take a DB backup first (see docs/DEPLOY-RUNBOOK.md). Run from the repo root in Git Bash.
set -e
N=$1; P=$((N-1))
[ -z "$N" ] && { echo "usage: deploy_dev.sh <N>"; exit 1; }
OPS="$(cd "$(dirname "$0")" && pwd)"
W=$(mktemp -d)
git branch -f qa$N HEAD
git bundle create $W/k.bundle qa$P..qa$N
base64 -w0 $W/k.bundle > $W/k.b64
SIZE=$(wc -c < $W/k.b64)
echo "bundle base64 size: $SIZE"
: > $W/send.sh
if [ "$SIZE" -gt 80000 ]; then
  # SSM command limit: send the bundle in 20KB pieces first.
  split -b 20000 -d -a 3 $W/k.b64 $W/chunk_
  echo "printf '' > /tmp/kqa$N.b64" > $W/c0.sh; bash $OPS/ssm.sh $W/c0.sh >/dev/null
  for c in $W/chunk_*; do
    echo "printf %s $(cat $c) >> /tmp/kqa$N.b64" > $W/c.sh
    bash $OPS/ssm.sh $W/c.sh | head -1
  done
else
  echo "printf %s $(cat $W/k.b64) > /tmp/kqa$N.b64" > $W/send.sh
fi
cat >> $W/send.sh <<EOF
set -e
base64 -d /tmp/kqa$N.b64 > /tmp/kqa$N.bundle
git bundle verify /tmp/kqa$N.bundle >/dev/null 2>&1 && echo bundle_ok
cd /opt/khelo-dev
git fetch /tmp/kqa$N.bundle qa$N:refs/remotes/origin/qa$N
git reset --hard origin/qa$N
git log -1 --oneline
bash scripts/deploy_remote.sh dev > /tmp/dev-deploy.log 2>&1 && echo deploy_ok || { echo deploy_FAILED; grep -n -i error /tmp/dev-deploy.log | tr -cd '[:print:]\n' | head -8; }
sleep 5
docker exec khel_o_dev_postgres sh -c 'psql -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" -tAc "select version_num from alembic_version"'
EOF
bash $OPS/ssm.sh $W/send.sh
rm -rf $W
