import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefundNeeded } from './RefundNeeded';

const row = { id: 'p1', kind: 'solo', amount: 250, paidAt: null, reason: 'No team spot was free', razorpayPaymentId: 'pay_X1', name: 'Test Person', email: 'test@example.invalid' };

let host: HTMLDivElement | null = null;
async function show(rows: typeof row[], onResolve = vi.fn()) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host!).render(<RefundNeeded rows={rows} busy={null} onResolve={onResolve} />);
  });
  return { host, onResolve };
}
function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
afterEach(() => {
  host?.remove();
  host = null;
});

describe('RefundNeeded', () => {
  it('renders nothing when no payment needs a refund', async () => {
    const { host: h } = await show([]);
    expect(h.textContent).toBe('');
  });

  it('shows the payment and keeps the button off until a real refund id is typed and confirmed', async () => {
    const { host: h, onResolve } = await show([row]);
    expect(h.textContent).toContain('Refund needed (1)');
    expect(h.querySelector('[role=alert]')).not.toBeNull();
    const btn = Array.from(h.querySelectorAll('button')).find((b) => b.textContent === 'Mark refunded')!;
    const [idBox, tick] = [h.querySelector('input[type=text], input:not([type])') as HTMLInputElement, h.querySelector('input[type=checkbox]') as HTMLInputElement];
    expect(btn.disabled).toBe(true);

    await act(async () => type(idBox, 'refund-123'));
    await act(async () => tick.click());
    expect(btn.disabled).toBe(true); // not a rfnd_ id
    expect(h.textContent).toContain('looks like rfnd_');

    await act(async () => type(idBox, 'rfnd_AbC12345'));
    expect(btn.disabled).toBe(false);
    await act(async () => btn.click());
    expect(onResolve).toHaveBeenCalledWith('p1', 'rfnd_AbC12345');
  });

  it('will not enable the button without the "I saw it in Razorpay" tick', async () => {
    const { host: h } = await show([row]);
    const btn = Array.from(h.querySelectorAll('button')).find((b) => b.textContent === 'Mark refunded')!;
    await act(async () => type(h.querySelector('input:not([type=checkbox])') as HTMLInputElement, 'rfnd_AbC12345'));
    expect(btn.disabled).toBe(true);
  });
});
