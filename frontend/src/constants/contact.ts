/**
 * KHEL-O's official public contact details: one place, so the GTA 6 pages, the
 * Organization schema and llms.txt can never disagree. Same values as the Contact
 * page (app/(legal)/contact). Change them here and in public/llms.txt together.
 */
export const KHELO_CONTACT = {
  /** One number for calls and WhatsApp. */
  phoneE164: '+918142128389',
  phoneDisplay: '+918142128389',
  email: 'hello@khel-o.com',
  /** Support hours stated on the Contact page. */
  hours: 'Monday to Saturday, 10:00 AM to 7:00 PM IST',
  hoursSchema: { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '10:00', closes: '19:00' },
  address: { locality: 'Hyderabad', region: 'Telangana', country: 'IN' },
} as const;

export const telHref = `tel:${KHELO_CONTACT.phoneE164}`;

/** wa.me wants digits only, no plus sign. */
export function whatsappHref(message: string): string {
  return `https://wa.me/${KHELO_CONTACT.phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
