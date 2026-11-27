import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const funnel = vi.fn();
vi.mock('@/lib/api/teamChallenges', () => ({ adminTeams: { funnel: (...a: unknown[]) => funnel(...a) } }));

import { FunnelPanel } from './FunnelPanel';

const base = {
  note: 'Browser events count distinct browser sessions.',
  visitors: { unique: 165, returnedAnotherDay: 12 },
  steps: [
    { key: 'visitors', label: 'Opened the page', count: 165, source: 'browser', ofPrevious: null, ofVisitors: null },
    { key: 'signup', label: 'Tapped Sign up', count: 16, source: 'browser', ofPrevious: 10, ofVisitors: 10 },
    { key: 'details', label: 'Finished the details', count: 4, source: 'browser', ofPrevious: 25, ofVisitors: 2 },
    { key: 'pay_started', label: 'Opened the payment window', count: 3, source: 'browser', ofPrevious: 75, ofVisitors: 2 },
    { key: 'paid', label: 'Payment confirmed (database)', count: 2, source: 'database', ofPrevious: 67, ofVisitors: 1 },
    { key: 'registered', label: 'Registered: team or solo spot made (database)', count: 2, source: 'database', ofPrevious: 100, ofVisitors: 1 },
  ],
  signupByKind: { team: 9, solo: 5, unspecified: 2, all: 16 },
  detailsByKind: { team: 2, solo: 2, unspecified: 0, all: 4 },
  payStartedByKind: { team: 1, solo: 2, unspecified: 0, all: 3 },
  checkout: { failedSessions: 1, dismissedSessions: 2, couldNotConfirmSessions: 0, note: 'Failed = Razorpay said so.' },
  outcomes: { paid: 2, paidTeam: 1, paidSolo: 1, refunded: 0, failedRecorded: 0, startedNotPaid: 0, registeredPayments: 2, registeredTeams: 1, registeredSolos: 1, paidWithoutEntry: 0 },
  reconciliation: { browserSaidPaid: 3, databasePaid: 2, match: false, note: '' },
  engagement: { communityClicks: 1, shareSheetOpened: 1, shareLinksCreated: 0, shareLinksOpenedByOthers: 0, mapClicks: 2, kheloLinkClicks: 0, note: '' },
  sources: [{ name: 'whatsapp', visitors: 22, signup: 4, payStarted: 1, paid: 1 }, { name: 'direct', visitors: 100, signup: 5, payStarted: 1, paid: 0 }],
  devices: [{ name: 'mobile', visitors: 144, signup: 14, payStarted: 3, paid: 2 }],
};

let host: HTMLDivElement | null = null;
async function show(data: unknown | Error) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (data instanceof Error) funnel.mockRejectedValue(data);
  else funnel.mockResolvedValue(data);
  host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host!).render(<FunnelPanel id="c1" />);
  });
  return host.textContent || '';
}
afterEach(() => {
  host?.remove();
  host = null;
});

describe('FunnelPanel', () => {
  it('shows every step with its share of the last step, and labels taps vs real records', async () => {
    const t = await show(base);
    for (const s of ['Opened the page', 'Tapped Sign up', 'Finished the details', 'Opened the payment window', 'Payment confirmed (database)', 'Registered']) {
      expect(t).toContain(s);
    }
    expect(t).toContain('10% of last step');
    expect(t).toContain('25% of last step');
    expect(t).toContain('taps');
    expect(t).toContain('real');
  });

  it('splits team and solo, keeps clicks and shares labelled as what they are, and shows the device and source tables', async () => {
    const t = await show(base);
    expect(t).toContain('9 / 5');
    expect(t).toContain('a click, not a confirmed join');
    expect(t).toContain('not a referral');
    expect(t).toContain('whatsapp');
    expect(t).toContain('mobile');
  });

  it('says when browsers and payment records disagree, and which to trust', async () => {
    const t = await show(base);
    expect(t).toContain('Browsers reported 3 paid, payment records show 2');
    expect(t).toContain('trust the payment records');
  });

  it('raises a visible warning when money is held but no team or player was made', async () => {
    const t = await show({ ...base, outcomes: { ...base.outcomes, paidWithoutEntry: 1 } });
    expect(t).toContain('1 payment paid but no team or player was made');
    expect(document.querySelector('[role=alert]')).not.toBeNull();
  });

  it('shows a plain message if the funnel cannot be loaded', async () => {
    const t = await show(new Error('nope'));
    expect(t).toContain('Couldn’t load the funnel');
  });
});
