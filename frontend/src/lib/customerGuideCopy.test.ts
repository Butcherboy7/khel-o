import { afterEach, describe, expect, it } from 'vitest';
import { HINT_STORAGE_KEY, HINTS_SEEN_SCRIPT } from './customerGuideCopy';

// Hints are in the server HTML; this inline script hides the used-up ones
// before the first paint, so nothing pops in or out and shifts the page.
describe('the early hint script', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-hints-seen');
  });

  const run = () => new Function(HINTS_SEEN_SCRIPT)();

  it('marks only the hints seen three or more times', () => {
    localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify({ explore: 3, pass: 1, cafe: 5 }));
    run();
    expect(document.documentElement.getAttribute('data-hints-seen')).toBe('explore cafe');
  });

  it('leaves the page alone for a first-time visitor', () => {
    run();
    expect(document.documentElement.hasAttribute('data-hints-seen')).toBe(false);
  });

  it('survives junk in storage', () => {
    localStorage.setItem(HINT_STORAGE_KEY, '{oops');
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-hints-seen')).toBe(false);
  });
});
