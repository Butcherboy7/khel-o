# Challenge integrity, discovery and reward accounting — design

Status: approved 2026-10-24 (with the clarifications recorded below). Built on
`feat/challenge-host` (dev qa105, 0336bb1). Dev first; production only on an
explicit "promote". No payment-model change, no entry fees, no ₹0 checkout.

## Non-negotiables

- Challenges are free. Public words: challenge, free sign-up, spots, waitlist.
- Rewards stay account-specific and café-specific; completed bookings and
  redemption history are never altered or deleted.
- Normal booking fee, the first-booking fee waiver and launch-slot counting
  are unchanged. Checkout and payout calculations are unchanged.
- Codes never on public pages or logs; phones admin-only.
- Single elimination is the only format.

## 1. Status transitions

| From → To | Only through |
|---|---|
| draft → open | Edit |
| open ↔ closed | Edit; Close check-in moves open → closed |
| open/closed → draft | Edit, only with no non-test entries |
| open/closed → live | Draw |
| live → finished | Finish |
| finished → live | Reopen (admin, reason required) |
| open/closed/live → cancelled | Cancel (admin, reason required) |
| cancelled → anything | never (create a new challenge) |

Edit refuses every other status change: 409 `USE_ACTION`. A no-op (same
status) is allowed. Reopen returns to `live`, which never takes sign-ups.

## 2. Defects and acceptance

- **D1** results, clear and draw refused on finished (409 `CHALLENGE_FINISHED`), no DB change.
- **D2** per-account use re-checked inside `apply_promotion_to_booking` after the campaign row lock; two simultaneous bookings by one waitlister → one discounted.
- **D3** partial unique index `(challenge_id, reward_kind) WHERE challenge_id IS NOT NULL AND superseded_at IS NULL`; reward creation under the challenge lock.
- **D4** tab counts and stat cards follow one rule and show "N practice not counted".
- **D5** score rules per result type (§4); contradictions → 422.
- **D6** joining refused once check-in has closed (400 `CHALLENGE_CLOSED`); admin restore still works.
- **D7** test/practice entries keep their placing but receive no reward or badge; nobody moves up into their place; excluded from the waitlist reward.
- **D8** practice players only where `ENVIRONMENT` is on an explicit dev list; unknown/missing → refused.
- **D9** door check-in needs an active entry (confirmed/waitlist) and an open/closed/live challenge.
- **D10** no move to draft once real players signed up (covered by §1).
- **D11** reward expiry shown as day, date, time and IST.

## 3. Finish, Reopen, corrections

Finish, in one transaction: lock challenge row → if finished, return as is →
validate bracket and scores → standings (test entries get nothing) →
`reconcile` rewards (prizes, champion partner offer, waitlist thank-you) →
badges by `INSERT … ON CONFLICT DO NOTHING`, key `ch_<challenge hex>_<place>`,
`campaign_id` = that place's reward → audit rows → `finished`, `finished_at` →
commit. Everything is in Postgres; any error rolls back all of it and a retry is
safe. `create_prizes`/`create_or_refresh_waitlist` stop committing; callers commit.

Waitlist thank-you: made at Finish, once; eligible = not test, and (still on the
waitlist, or moved up and not a no-show). One booking each, expiry server-side.

Reopen: admin, reason required, challenge lock, back to `live`, audit row,
nothing else changes.

Next Finish, per place whose account changed (under the challenge lock and the
campaign lock checkout uses):

- old reward unused → `superseded_at`, `is_active=false`, row kept; new reward; badge moved (removal audited).
- old reward redeemed → booking untouched; old reward superseded; **replacement reward is KHEL-O-funded**; badge moved; audit row records place, old/new account, the redeemed booking and its discount.
- old reward in an active hold → Finish refused with the exact retry time in IST.

Active hold = booking `pending_payment`, created < 15 min ago, not released.
Rechecked live on every Finish; a release or expiry allows an immediate retry
(late captures after 15 min are already auto-refunded by payment_service).

## 4. Result types

`challenges.result_type`: `games` (default; Tekken etc.) or `goals` (EA SPORTS FC).

- games: both scores empty or both given; winner has exactly the majority of
  best_of, loser fewer; no draws.
- goals: best_of and final_best_of are 1; goals 0–30; winner has more goals, or
  on level goals `tiebreak='penalties'` with both penalty scores and the winner
  has more penalties; a level score without a tiebreak is refused.

Stored separately: `score_a/b`, `winner_entry_id`, `tiebreak`, `tiebreak_a/b`.
Existing rows aren't re-validated on write; Finish validates all.

## 5. Players

- Move-up notification (existing `notifications`, type SYSTEM) in the same
  transaction as the move; dedupe `challenge_promoted:<entry>:<promoted_at>`;
  sets `told_via='app'`. Moved up at close of check-in → `told_via='in_person'`, no notification.
- RSVP prompt on the home card: confirmed, unanswered, start < 48 h away and in
  the future, open/closed. Yes/No + dismiss (per device per day).
- `/challenges` public list (open/closed/live, finished in last 30 days as
  Results; never draft or cancelled), menu link, home strip only while one is
  open/live; upcoming/past on the profile. No bottom tab.
- Cancel: banner on public, player and bracket pages; joins, RSVP, withdraw,
  check-in, draw and results refused; one notification per active entrant
  (`challenge_cancelled:<entry>`); nothing about refunds (sign-up is free).
- Reopen and corrections send players nothing.
- Consent: `challenge_entries.consent_version` stamped from one constant;
  existing rows stay NULL ("before versioning").

## 6. Owner and estimates (may follow 1 Nov)

Read-only owner view filtered by `cafes.owner_id` (other cafés → 404); no
phones, consents, sources or test flags. Per-challenge `plan_config` with
presets (Tekken 8/13/2, EA FC 15/15/3) and a range that names what's included.

## 7. KHEL-O-funded reward accounting

How it works today: a café's payable is the sum of
`platform_fees.owner_settlement_amount` (café price **after** discount) plus
unconsumed `cafe_payout_adjustments` (today only negative refund clawbacks,
created automatically). A `cafe_payouts` row records each transfer, with
`cafe_payout_items` per booking. `offer_campaigns.khelo_funded` is read only
by the challenge Rewards tracker; no payout code reads it, and there is no
admin action that records a positive add-back. A manual reimbursement of a
funded discount is therefore **not recorded anywhere in KHEL-O today**.

New, read-only: Admin → Payouts gets "KHEL-O-funded rewards to add back",
by café, with the bookings (date, reward, discount, booking ref). Source:
the same query as the Rewards tracker (paid bookings on `khelo_funded`
challenge campaigns, superseded ones included), each booking counted once.
It is labelled "Not included in the payout amount. KHEL-O doesn't record
whether this was paid; check your bank records." Each booking also shows
whether its café share is already in a recorded payout (via
`cafe_payout_items`) — that tells you the café share was paid, not the add-back.
Recording add-backs (e.g. positive adjustments) is a later, separately
approved change.

Prize funding (`prizeKheloFunded`, default café-funded) stays configurable.
Whether AdamsDen agrees to fund 1st–3rd must be confirmed before the event.

## 8. Migration 069

Additive, nullable: `offer_campaigns.superseded_at` + the partial unique index;
`challenges.finished_at`, `plan_config`, `result_type`;
`challenge_entries.told_via`, `consent_version`; `challenge_matches.tiebreak`,
`tiebreak_a`, `tiebreak_b`.

Pre-check (done 2026-10-24, read-only, aggregates): dev — 0 duplicate groups,
1 redeemed prize (café-funded), 0 funded amounts owed, alembic 068; prod — no
challenges or challenge rewards at all, alembic 068. The migration still checks
for duplicate groups and **aborts** if any exist, for manual review; it never
supersedes rows itself.

Old code with the new schema: ignores new columns; superseded rows are inactive
so checkout refuses them; old `create_prizes` counts them as made. Risks: old
admin on/off switch could re-enable a superseded reward; old code can't show
`cancelled`. Rollback: revert commit keeping 069; first move cancelled
challenges to closed and leave superseded rewards off. Downgrade (drops index
and columns) only with approval. Prod: backup → migrate → deploy → smoke test,
only on "promote".

## 9. Order

1. Migration 069 + status-transition enforcement.
2. Integrity fixes D1–D11 (except D10, in 1).
3. Finish/Reopen/reconcile, badges, Achievements row, Payouts add-back line.
4. Discovery, My challenges, move-up notifications, RSVP prompt.
5. Cancel, consent version.
6. Owner view, estimate settings (may follow 1 Nov).

Each phase: targeted + regression tests, migration/transaction checks, dev
deploy, browser test, report.
