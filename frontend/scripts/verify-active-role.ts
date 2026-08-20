/**
 * Standalone verification for sanitizeActiveRole (frontend/src/store/authStore.ts).
 *
 * No jest/vitest runner is configured in this project (only Playwright e2e).
 * Per task-1-brief.md's fallback instruction ("If no jest config exists ...
 * convert this to a tsx-runnable script — do not skip the test"), this script
 * runs the same three assertions from the brief's Step 1 as plain runtime
 * checks, executed with `npx tsx`.
 *
 * Run: npx tsx scripts/verify-active-role.ts
 */
import { sanitizeActiveRole } from '../src/store/authStore';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`);
}

check(
  "rejects a forged role the account does not hold",
  sanitizeActiveRole('admin', ['gamer', 'cafe_owner']),
  'gamer',
);

check(
  "keeps a role the account does hold",
  sanitizeActiveRole('cafe_owner', ['gamer', 'cafe_owner']),
  'cafe_owner',
);

check(
  "falls back to gamer when roles are unknown",
  sanitizeActiveRole('admin', undefined),
  'gamer',
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
