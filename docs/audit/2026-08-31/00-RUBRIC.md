# KHEL-O Full Codebase Audit — Shared Rubric

**Audit date:** 2026-08-31
**Rule for every auditor:** READ ONLY. Do not modify any source file. Write only your own phase report.

## Stack facts (do not re-derive)

- **Backend:** Python FastAPI, SQLAlchemy ORM, Alembic migrations, PostgreSQL. `backend/app/`
  - Layering: `api/v1/*` (routes) → `services/*` (business logic) → `repositories/*` (data) → `models/*` (ORM)
- **Frontend:** Next.js App Router (TypeScript), Zustand (`src/store`), TanStack Query (`src/hooks/queries`), Tailwind. `frontend/src/`
- **NOT Supabase.** There is no Postgres RLS. All authorization is application-layer: FastAPI dependencies in
  `backend/app/api/deps.py` plus ownership checks inside services. Audit that as the RLS equivalent —
  every endpoint must be checked for "can user X touch resource Y".
- **Payments:** Razorpay (`services/payment_service.py`, `hooks/useRazorpay.ts`), plus a `MockPaymentModal`.
- **Roles:** customer, cafe owner, staff, super admin (`models/user_role.py`).
## The prior audit — how to treat it

`LAUNCH_READINESS_AUDIT.md` (Aug 2026, 1111 lines) is the previous audit. It is **stale reference material,
not truth.** An unverified snapshot of an older tree is actively dangerous: it makes fixed bugs look open
and lets regressions hide behind a "known issue" label.

An untouched original is archived at `docs/audit/2026-08-31/99-ARCHIVE-launch-readiness-audit-original.md`.

**Cross-verification protocol — required whenever your phase overlaps a prior claim:**

1. Find the prior claim's cited file/line. Open the code as it exists **today**.
2. Assign exactly one verdict:

   | Verdict | Meaning |
   |---|---|
   | **VERIFIED-FIXED** | The defect described is genuinely gone. Cite the code that now handles it. |
   | **STILL-OPEN** | Reproduced against current code. Re-report it as a normal finding with today's line numbers. |
   | **NEVER-VALID** | The claim was wrong when written (misread code, guard existed elsewhere). Say what it missed. |
   | **OBSOLETE** | The feature/file no longer exists, so the claim is moot. |
   | **PARTIAL** | Fixed in one path, still broken in another. Name both paths. |

3. **Line numbers in the prior audit are not trustworthy** — the tree has moved. Locate code by symbol
   name and content, never by trusting the cited line number.
4. **VERIFIED-FIXED requires positive evidence.** "I didn't see the bug" is not evidence. Quote the guard,
   constraint, or invalidation call that closes it. If you cannot find positive evidence, it is STILL-OPEN
   with Confidence: Low — never silently downgrade.
5. A prior claim marked fixed **still needs a regression test check**: note whether any test locks the fix in.
   A fix with no test is a P3 finding in its own right.

Add a `## Prior-audit cross-check` section to your report with a table:
`Prior claim | Verdict | Evidence (file:line) | New finding ID (if still open)`

Prior P0s to specifically check if they fall in your phase:
- P0-1 Scanner cache invalidation missing — `owner/scanner/page.tsx`
- P0-2 Race condition in booking creation — `booking_service.py`
- P0-3 Dead Google OAuth button — `(auth)/login/page.tsx`
- P0-4 Dead Edit Cafe button — `owner/settings/page.tsx` (note: an `EditCafeModal.tsx` now exists — verify it is wired up)
- P0-5 Silent error swallowing — `lib/api/client.ts`

## Severity ranking (MANDATORY — every finding gets exactly one)

| Level | Meaning |
|---|---|
| **P0** | Could lose money or compromise security. Payment/refund/payout correctness, authz bypass, data leak, exposed secret, privilege escalation, unauthenticated mutation. |
| **P1** | Could break booking. Race conditions, double-booking, availability miscalculation, timezone bugs, state corruption, crash on a core path. |
| **P2** | Causes bad UX. Wrong/missing loading & error states, broken mobile layout, confusing flow, dead buttons, stale cache shown to user. |
| **P3** | Technical debt. Duplication, dead code, weak types, missing tests, N+1 that is not yet user-visible, inconsistent patterns. |
| **P4** | Nice-to-have. Polish, minor perf, style, docs. |

## Required finding format

Every finding MUST use this exact block. No prose-only observations.

```
### [P0] <short imperative title>

- **Where:** `path/to/file.py:123-140` (real line numbers, verified by reading the file)
- **What:** One or two sentences on the actual defect.
- **Why it's P0:** The concrete bad outcome. Name the money lost / the data exposed / the booking broken.
- **Repro / trigger:** The specific sequence or input that causes it. If you cannot state one, downgrade the severity.
- **Fix sketch:** 1-3 sentences. Do not write the patch.
- **Confidence:** High | Medium | Low — Low means "suspicious, needs a human to confirm".
```

## Anti-slop rules

1. **No speculative findings.** If you did not read the code, do not report it. Quote or cite line numbers you actually saw.
2. **No padding.** 12 real findings beat 60 filler ones. Do not invent P3/P4 items to look thorough.
3. **Severity honesty.** P0 means money or security. "Missing type annotation" is never P0. Inflating severity destroys the report's value.
4. **Verify before claiming a bug.** Check whether a guard exists elsewhere (a decorator, a dependency, a DB constraint, a migration) before calling something unprotected.
5. **State what you did NOT cover** at the end of your report, so the coordinator can fill gaps.

## Report file structure

Start your report with:

```
# Phase N — <name>

**Scope:** <files/dirs you actually read>
**Verdict:** <2-4 sentence overall health assessment of this slice>

## Findings summary
| ID | Sev | Title | File |
|---|---|---|---|
| N-1 | P0 | ... | ... |
```

Then the full finding blocks in severity order (all P0s, then P1s, ...).
End with `## Not covered` and `## Notes for the coordinator`.
