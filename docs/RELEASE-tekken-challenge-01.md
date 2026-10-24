# Release plan: KHEL-O Tekken Challenge #01 (prepared 2026-10-25, NOT executed)

Event: Sunday 1 November 2026, 3-6 PM, AdamsDen, KPHB. Nothing in this file has been run on production except the read-only checks and the backup listed under "Evidence".

## 1. What ships

Production today = `main` = `3965f77` (deploy tag `deploy/prod93`), alembic **068**, 37 tables, 0 challenges, 0 entries.

The release is `main` fast-forwarded to the dev tip. It is exactly the commits below, in one straight line on top of `3965f77` (no merge, no cherry-pick, no rewrite). The whole diff is backend + frontend code, two additive migrations, tests and docs. **No** changes to config, env vars, docker, compose, package files, prices, fees, payouts or payment code.

| Commit | What |
|---|---|
| `0336bb1` | Challenge-day pack: host guide, practice players (dev only), ready-to-play list, owner lock on challenge rewards, home card |
| `ddc2f3f`, `0f970fc` | Design docs |
| `f796eca` | Migration 069 and enforced status moves |
| `2968bb5`, `a9b2b8a` | Phase 2: results checks, Finish validation, sign-up/check-in closing, superseded rewards, locked reward re-check, IST expiry |
| `d9569af` | Phase 3: atomic Finish (rewards + badges + audit in one transaction), Reopen, KHEL-O-funded replacements flagged, Payouts "add-back" (read-only) |
| `364d97e` | Fix: checkout re-reads the reward fresh under its lock (found by the Postgres race test) |
| `921e952`, `1944916` | Docs; Payouts date/time separator |
| `0a1418c`, `7195730` | Phase 4 (trimmed): My challenges page, move-up notification, "Are you coming?" prompt |

Migrations: **069** (new nullable columns on offer_campaigns/challenges/challenge_entries/challenge_matches + one partial unique index, stops with a clear error if a challenge already has two current rewards of one kind) and **070** (two nullable columns + a self-referencing foreign key on offer_campaigns). Both additive. Phase 4 adds **no** migration.

## 2. Migration plan (rehearsed on a real copy of production)

Required order: `068 -> 069 -> 070`. `deploy_remote.sh` runs `alembic upgrade head` in a one-off container *before* the cut-over, so the old containers keep serving while it runs; additive columns do not disturb old code.

Preconditions (all checked read-only on 2026-10-25): production alembic = 068; none of the new columns/index exist; no duplicate challenge rewards (0 challenges, 0 campaigns linked to challenges), so 069's guard cannot fire.

Rehearsal: a fresh `pg_dump` of production was restored into a scratch database (`rehearsal_prod_copy`, on the DEV Postgres container, never on production), then `alembic upgrade head` ran 068 -> 069 -> 070 against it. Result: head 070, every new column and the index present, row counts unchanged (242 users, 3523 bookings). The duplicate-guard path itself could not be exercised on production data because there is no data for it; it is covered by test.

Failure plan: if the migration step fails, `set -e` stops the deploy before the cut-over and the old containers keep running; nothing to roll back at the code level. Fix forward or stop.

## 3. Backup

Taken 2026-10-24 22:37 UTC (read-only `pg_dump -Fc` of the production database):
`/root/khelo-db-backups/prod-pre-challenge-release-20261024-2237.dump`, 1,932,952 bytes, 37 TABLE DATA entries (all 37 tables). **Restore tested**: restored with `--exit-on-error` into the scratch database; alembic 068, 37 tables, 242 users, 3523 bookings, 0 challenges, identical to production at the time.
**Take one more immediately before the real deploy** (the data changes between now and then): run `scripts/ops/ssm.sh` with the same dump command, check size > 1 MB and 37 TABLE DATA entries, and only then continue.

## 4. Release runbook (needs the owner's explicit "promote")

Run from the repo root in Git Bash, on the Phase-4 commit already tested on dev.

1. Pre-checks: `git fetch`; confirm `origin/main` is still `3965f77` and the commit to ship has it as an ancestor (`git merge-base --is-ancestor origin/main HEAD`). Backend `pytest -q` and frontend `tsc`, `eslint`, `vitest`, `next build` all green on that commit.
2. Fresh production backup (section 3). **Stop if size or table count is wrong.**
3. `export TMPDIR=<scratchpad path with forward slashes>`; `bash scripts/ops/deploy_prod.sh 94` (bundles `prod93..prod94`, runs migrations, cuts over, prints `/`, `/login`, `/admin/bookings` status codes and the alembic version).
4. Expect: `deploy_ok`, three `200`s, alembic `070`.
5. Tag and publish: `git tag deploy/prod94 HEAD`; fast-forward `main` and `dev` to it (`git push origin HEAD:main HEAD:dev refs/tags/deploy/prod94`, **no force**).
6. Smoke tests (as admin, then as a test player): `/health`; `/challenge/tekken-01` after creating it (section 6); sign up with a test account; `/my-challenges`; Admin -> Challenges -> the challenge -> Challenge day opens; Admin -> Payouts shows "KHEL-O-funded rewards to add back" with "No paid bookings".
7. Create `tekken-01` as **draft**, check every field, then open it (section 6).

Stop conditions: any non-200 on the three URLs; alembic not 070; `deploy_FAILED`; health check not 200; the backup check failing; any unexpected error text in `/tmp/prod-deploy.log`.

## 5. Rollback (no downgrade)

- Code: redeploy the previous commit (`3965f77`, tag `deploy/prod93`) with `deploy_prod.sh 95` from a branch at that commit. The two migrations are additive: the old code ignores the new columns, so **leave the database at 070**. Do not run `alembic downgrade`.
- One thing the old code cannot do after rollback: it does not know about the "one current reward per kind" index. It only creates a reward if none exists, so it cannot collide with it.
- Data: if data itself is damaged (not expected), restore from the verified backup into a scratch database first, compare, and only then decide; that is a separate decision for the owner.

## 6. Making the real challenge, and what the admin does

Create `tekken-01` as a draft (Admin -> Challenges -> New), fill every field (title, AdamsDen, game, format, best-of, capacity, start/end, check-in window, rules, prizes text, Instagram), then change status to **Open** when sign-ups should start. Set the rewards in Admin -> the challenge -> Rewards **before** the day, and decide the AdamsDen funding question first (see risks).

On the day, simply:
1. **Before:** people sign up (free). Spots fill in order, then a waitlist. If someone cannot come, take them out on the challenge page and the next waitlist player moves up and gets an in-app notice. Players who haven't answered see "Are you coming?" on their home screen.
2. **Doors open (about 30 min before):** open **Challenge day** on your phone. Scan each player's "My QR" to check them in, or tap their name.
3. **At the start time:** press **Close check-in**. Missing confirmed players become no-shows; waitlist players who are here take their spots.
4. **Make the draw.** Put **Bracket on projector** on the TV.
5. **Play:** call the top match from "Ready to play"; when it ends, tap the match and enter who won and the score.
6. **After the final:** press **Finish the challenge**. One step makes the podium rewards, badges and the waitlist thank-you. You see a short summary of what was made.
7. If a result was wrong: **Reopen to correct a result** (a reason is required), fix it, **Finish** again. Rewards for the wrong person are replaced; any already-used reward stays on record and its replacement is flagged "needs a look at the books" and shown in Admin -> Payouts.
8. **Redemption:** winners open their KHEL-O page and book at the café with their reward. Admin -> Payouts -> "KHEL-O-funded rewards to add back" lists each paid booking once; it is an estimate to settle by hand and never says anything was paid.

## 7. Known risks and limits (read before promoting)

- **AdamsDen prize-funding agreement is not settled in the system.** KHEL-O does not record reimbursements; the add-back list is an estimate for manual settlement.
- **Sign-up rate limit.** The anti-bot guard allows 30 challenge sign-ups per hour per network address and 3 per phone number. Many players on the café's own Wi-Fi (or sharing a mobile carrier address) could be refused with "try again in a few minutes". Fine for pre-registration from many places; do not run a mass walk-up sign-up from the café Wi-Fi. This is intentional protection and I did not weaken it.
- Partner-café offer: verified on dev with an isolated test café (replacement keeps scope, funding, expiry; replaced reward unusable, including 8 simultaneous attempts). At a café that is not a partner the code simply gives no discount (existing behaviour). Not verified on production data (there is none yet).
- Move-up notification is in-app only (no email/push). Players who don't open the app are not reached; the admin's WhatsApp "told" button still exists for that.
- Dev test data is still in dev (cleanup deferred until after a fresh dev backup).
