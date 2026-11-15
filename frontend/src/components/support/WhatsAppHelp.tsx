import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/cn';

/** KHEL-O help line on WhatsApp (country code, no symbols, as wa.me wants it). */
export const HELP_WHATSAPP = '918142128389';

/** A wa.me link with the message already typed, so a stuck gamer only taps Send. */
export function helpWhatsAppLink(about?: string): string {
  const text = about
    ? `Hey, I was just trying to book ${about}. I have a doubt. Can you help me out?`
    : 'Hey, I was just trying to book on KHEL-O. I have a doubt. Can you help me out?';
  return `https://wa.me/${HELP_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/**
 * "Stuck? Ask us on WhatsApp" for the booking and reservation screens.
 * `card` is a full row with a line of explanation; `link` is one small line
 * that fits under a pay button.
 */
export function WhatsAppHelp({
  about,
  variant = 'card',
  className,
}: {
  /** What they were booking, e.g. "GTA 6 at AdamsDen". Goes into the message. */
  about?: string;
  variant?: 'card' | 'link';
  className?: string;
}) {
  const href = helpWhatsAppLink(about);
  if (variant === 'link') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('inline-flex min-h-[32px] items-center gap-1 font-semibold text-[#075E54] underline-offset-2 hover:underline', className)}
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
        Need help?
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'btn-depth-soft flex min-h-[64px] items-center gap-3 rounded-2xl border border-[#25D366]/40 bg-card px-4 py-3 [--edge:#25D36666]',
        className,
      )}
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#25D366] text-white">
        <WhatsAppIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold text-text-primary">Stuck or confused? Chat with us</span>
        <span className="block text-caption text-text-secondary">A real person on WhatsApp helps you book.</span>
      </span>
      <span className="flex-none rounded-full bg-[#25D366] px-3 py-1.5 text-caption font-bold text-[#06301f]">WhatsApp</span>
    </a>
  );
}
