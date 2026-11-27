/**
 * Counts how one Razorpay checkout ended, without ever mixing the endings up:
 *
 *   challenge_pay_failed        Razorpay itself said an attempt failed (declined card, UPI timeout...).
 *                               The person may try again inside the same checkout, so `attempt` counts them.
 *   challenge_pay_dismissed     The person closed the checkout window, or cancelled inside it. Razorpay told us
 *                               so explicitly. Never guessed from a callback that did not arrive.
 *   challenge_pay_verify_error  Razorpay reported a payment but our server could not confirm it. The money
 *                               MAY have been taken (the webhook can still confirm it), so this is not "failed".
 *
 * A payment that succeeded is never reported here: the page's own `challenge_paid` (after the server confirmed
 * it) is the only success signal. One tracker is made per checkout, so each ending is logged once.
 * No amounts, order ids, payment ids, names or contact details are ever put in the metadata.
 */
export const CHECKOUT_UNAVAILABLE_REASON = 'checkout_unavailable';

type Track = (action: string, metadata: Record<string, unknown>) => void;

export interface CheckoutTracker {
  /** Razorpay's `payment.failed` callback (or the checkout script not loading). */
  failed(reason: string): void;
  /** The checkout window was closed. */
  dismissed(): void;
  /** Razorpay handed us a payment to confirm. From here on nothing is reported as failed or dismissed. */
  paymentReceived(): void;
  /** Our server could not confirm the payment Razorpay reported. */
  verifyError(code: string): void;
}

const clamp = (v: unknown, n = 40) => String(v ?? 'unknown').replace(/[^\w .:-]/g, '').slice(0, n) || 'unknown';

export function createCheckoutTracker(opts: { slug: string; kind: string; track: Track; dismissDelayMs?: number }): CheckoutTracker {
  const { slug, kind, track } = opts;
  // The window closing right after a payment goes through must not read as "dismissed".
  // The success callback can land a moment after the close, so a close is held briefly before it counts.
  const delay = opts.dismissDelayMs ?? 1500;
  let attempts = 0;
  let received = false;
  let unavailable = false;
  let dismissedSent = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sendDismissed = (via: 'closed' | 'cancelled_in_checkout') => {
    if (received || unavailable || dismissedSent) return;
    dismissedSent = true;
    track('challenge_pay_dismissed', { challenge: slug, kind, via, afterFailure: attempts > 0, attempts });
  };

  return {
    failed(reason) {
      if (received) return;
      if (reason === CHECKOUT_UNAVAILABLE_REASON) {
        // The payment window never opened (slow network, blocker). Not a declined payment, not a close.
        if (unavailable) return;
        unavailable = true;
        track('challenge_pay_failed', { challenge: slug, kind, reason: CHECKOUT_UNAVAILABLE_REASON, attempt: 0 });
        return;
      }
      // Cancelling inside Razorpay's own page is the person choosing to stop, not a payment failure.
      if (reason === 'payment_cancelled') {
        sendDismissed('cancelled_in_checkout');
        return;
      }
      attempts += 1;
      track('challenge_pay_failed', { challenge: slug, kind, reason: clamp(reason), attempt: attempts });
    },
    dismissed() {
      if (received || unavailable || dismissedSent || timer) return;
      timer = setTimeout(() => {
        timer = null;
        sendDismissed('closed');
      }, delay);
    },
    paymentReceived() {
      received = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    verifyError(code) {
      track('challenge_pay_verify_error', { challenge: slug, kind, code: clamp(code) });
    },
  };
}
