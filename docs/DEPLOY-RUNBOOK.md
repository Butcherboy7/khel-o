# Deploy runbook (read this first on a new machine)

Small on purpose: this file plus `scripts/ops/` replaces dragging old chat history around.

## Setup on a new PC (about 10 minutes)
1. Install: Git (with Git Bash), Node.js, Python 3.13, AWS CLI v2, Google Chrome. The Session Manager plugin is optional (only for `aws ssm start-session`).
2. `aws configure --profile khelo` (region `ap-south-1`). Use a NEW IAM access key for this PC; do not copy credentials files.
3. Check: `aws ssm describe-instance-information --profile khelo --region ap-south-1` lists `i-0098e44a41a17ac8e`.
4. `git clone` the repo, `cd frontend && npm install`, `pip install -e backend`. Copy `.env` / `.env.local` from the old PC over a secure channel (they are not in git).

## How prod is deployed
GitHub Actions is billing-blocked and the repo is private, so we deploy from the laptop:
`bash scripts/ops/deploy_prod.sh <N>` builds a git bundle `prod(N-1)..prodN`, sends it to the server over SSM,
resets `/opt/khelo-prod` to it and runs `scripts/deploy_remote.sh prod`. Branches named `prodN` mark each deploy;
the newest one at the time of writing is `prod64`. Dev lives at `/opt/khelo-dev` (same idea, with `dev` scripts).
- Server: instance `i-0098e44a41a17ac8e`, `ap-south-1`, prod path `/opt/khelo-prod`, containers `khel_o_backend`, `khel_o_postgres` (dev: `khel_o_dev_*`).
- Edge proxy is Caddy on the server. Site checks after deploy: `/`, `/login`, `/admin/bookings`.

## Before any deploy
- `cd backend && python -m pytest -q --deselect tests/test_duration_pricing_offer_safety.py::test_offer_hour_window_checked_in_ist_not_utc` (about 4 minutes)
- `cd frontend && npx tsc --noEmit && npx next build` (tsc and eslint alone miss server/client boundary errors)
- Click through the change in a real browser (puppeteer-core + local Chrome) against a local stack before saying done.
- Dev first, prod after approval, unless told "deploy to prod".

## Database
- New alembic migration = back up first. Backups live in `/root/khelo-db-backups/` on the server.
- SQL: `bash scripts/ops/prod_sql.sh file.sql`. Python in the app container: `bash scripts/ops/prod_python.sh file.py ENV=value`.
- Never print `DATABASE_URL`, tokens or passwords from server output.
- Alembic on prod is at 059. Migration 060 (tournaments) exists only on dev / `feat/tournaments`; do not number a new migration 060 on a prod branch.

## Gotchas
- SSM caps a command at about 97KB; `deploy_prod.sh` splits big bundles automatically.
- Windows CRLF: edit files with Python newline handling, not blind sed.
- Next 14.1: client pages get `params` synchronously, use `useParams()`, not `use(params)`.
- "Booking soon" cafés are real lead listings, not test data. The demo café (`khelo-demo-*`, user `khelo.demo.*`) is fake and hidden everywhere (`backend/app/core/demo.py`); rebuild it with `backend/scripts/seed_demo_owner.py`.
- 33 bot accounts still need deactivating by hand in admin Users.
- Do not push or deploy things the person did not ask for; production changes are announced and confirmed.

## Dev (same server, `/opt/khelo-dev`, containers `khel_o_dev_*`)
- `bash scripts/ops/deploy_dev.sh <N>` bundles `qa(N-1)..qaN` (latest qa branch was `qa61`) and runs `deploy_remote.sh dev`.
- `scripts/ops/dev_python.sh` and `scripts/ops/dev_sql.sh` are the dev twins of the prod helpers.
- Dev and prod share one EC2 instance, so one AWS profile (`khelo`) covers both.
