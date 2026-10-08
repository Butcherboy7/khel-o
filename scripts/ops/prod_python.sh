#!/bin/bash
# Run a local Python file inside the prod backend container, via SSM.
#   bash scripts/ops/prod_python.sh path/to/file.py [ENV=value ...]
# The file runs with the app importable (use `from app.database import AsyncSessionLocal`).
# Pass secrets as ENV=value args (e.g. DEMO_PASSWORD=...) - never hard-code them in the file.
set -e
OPS="$(cd "$(dirname "$0")" && pwd)"
F=$1; shift
ENVS=""; for e in "$@"; do ENVS="$ENVS -e '$e'"; done
W=$(mktemp)
cat > $W <<EOF
printf %s $(base64 -w0 "$F") | base64 -d > /tmp/x.py
docker cp /tmp/x.py khel_o_backend:/tmp/x.py
docker exec $ENVS khel_o_backend sh -c 'd=\$(dirname \$(dirname \$(find / -path /proc -prune -o -path "*app/main.py" -print -quit))); mkdir -p \$d/scripts; cp /tmp/x.py \$d/scripts/x.py; cd \$d && PYTHONPATH=. python scripts/x.py 2>&1 | tail -30'
EOF
bash $OPS/ssm.sh $W
rm -f $W
