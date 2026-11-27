import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/share', () => ({ createShare: () => 'https://khel-o.com/s/x' }));
import { ShareModal } from './ShareModal';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="opener" onClick={() => setOpen(true)}>Share</button>
      <ShareModal isOpen={open} onClose={() => setOpen(false)} heading="Share it" message="hi" path="/x" context="campaign" />
    </>
  );
}

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

describe('ShareModal keyboard', () => {
  it('moves focus in, closes on Escape and puts focus back on the button that opened it', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host!).render(<Harness />);
    });
    const opener = host.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    await act(async () => opener.click());
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Close');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('ignores other keys', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host!).render(<Harness />);
    });
    await act(async () => (host!.querySelector('#opener') as HTMLButtonElement).click());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
  });
});
