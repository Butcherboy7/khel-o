#!/bin/bash
# Run a local .sql file against the PROD database via SSM (psql reads the file on stdin, so quoting is safe).
#   bash scripts/ops/prod_sql.sh path/to/query.sql
# Read-only queries are fine any time. For writes: back up first (docs/DEPLOY-RUNBOOK.md).
set -e
OPS="$(cd "$(dirname "$0")" && pwd)"
W=$(mktemp)
cat > $W <<EOF
cat > /tmp/q.sql <<'SQLEOF'
$(cat "$1")
SQLEOF
docker exec -i khel_o_postgres sh -c 'psql -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" -f -' < /tmp/q.sql
EOF
bash $OPS/ssm.sh $W
rm -f $W
