#!/bin/bash
# Install the community-email cron on the prod box, then show what it would send (dry run).
#   AWS_PROFILE=khelo bash scripts/ops/install_community_cron.sh
set -e
OPS="$(cd "$(dirname "$0")" && pwd)"
W=$(mktemp)
cat > $W <<EOT
printf %s $(base64 -w0 "$OPS/../../deploy/cron/khelo-community-emails") | base64 -d > /etc/cron.d/khelo-community-emails
chmod 644 /etc/cron.d/khelo-community-emails
tail -1 /etc/cron.d/khelo-community-emails
docker exec -e PYTHONPATH=/app khel_o_backend python scripts/run_community_emails.py --dry-run 2>&1 | tail -5
EOT
bash $OPS/ssm.sh $W
