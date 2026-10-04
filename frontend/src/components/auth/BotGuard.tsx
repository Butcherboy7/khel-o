'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getFormTicket } from '@/lib/api/auth';

/**
 * Invisible bot checks for the sign-up, login and reset forms (no captcha).
 * The form asks the server for a signed ticket when it appears; the server
 * refuses a sign-up that comes back faster than a person could fill it in.
 * The trap is a field people never see; form-filling bots fill it in.
 * See backend app/core/bot_guard.py.
 *
 *   const { guardFields, trap } = useBotGuard();
 *   <form>{trap} ...</form>
 *   await register({ ...values, ...(await guardFields()) });
 */
export function useBotGuard() {
  const ticket = useRef<string | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getFormTicket()
      .then((t) => {
        ticket.current = t;
      })
      .catch(() => {
        /* fetched again on submit */
      });
  }, []);

  const guardFields = useCallback(async () => {
    if (!ticket.current) {
      // The first fetch failed (flaky network). A brand-new ticket can be "too
      // fast" for sign-up, but the retry a few seconds later passes.
      ticket.current = await getFormTicket().catch(() => null);
    }
    return { formTicket: ticket.current ?? undefined, website: trapRef.current?.value || undefined };
  }, []);

  const trap = (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Leave this empty
        <input ref={trapRef} type="text" name="khelo_site_url" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );

  return { guardFields, trap };
}
