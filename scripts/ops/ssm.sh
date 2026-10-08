#!/bin/bash
# Run a local bash script on the prod server over AWS SSM and print its output.
#   bash scripts/ops/ssm.sh path/to/script.sh
# Needs: AWS CLI v2 + profile "khelo" (region ap-south-1). SSM caps a command at ~97KB,
# so keep the script small (deploy_prod.sh splits big bundles for you).
set -e
PROFILE=${AWS_PROFILE_NAME:-khelo}
REGION=ap-south-1
INSTANCE=i-0098e44a41a17ac8e
TMP=$(mktemp)
B64=$(base64 -w0 "$1")
printf '{"commands":["echo %s | base64 -d > /tmp/job.sh; bash /tmp/job.sh 2>&1"]}' "$B64" > "$TMP"
CID=$(aws ssm send-command --profile $PROFILE --region $REGION --instance-ids $INSTANCE \
  --document-name AWS-RunShellScript --timeout-seconds 1800 --parameters "file://$TMP" \
  --query Command.CommandId --output text)
for i in $(seq 1 200); do
  sleep 4
  ST=$(aws ssm get-command-invocation --profile $PROFILE --region $REGION --command-id $CID --instance-id $INSTANCE --query Status --output text)
  case $ST in Success|Failed|Cancelled|TimedOut) break;; esac
done
echo "STATUS=$ST"
aws ssm get-command-invocation --profile $PROFILE --region $REGION --command-id $CID --instance-id $INSTANCE \
  --query StandardOutputContent --output text
rm -f "$TMP"
