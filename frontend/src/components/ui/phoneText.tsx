import { Fragment, type ReactNode } from 'react';
import { KHELO_CONTACT } from '@/constants/contact';
import { PhoneInline } from '@/components/ui/PhoneInline';

/**
 * Renders a sentence with KHEL-O's number turned into a tap-to-call link plus copy button.
 * The number must appear in the text exactly as KHELO_CONTACT.phoneDisplay (no spaces). The
 * plain string stays in the schema; this is only for what people see.
 */
export function withPhone(text: string, where = 'text'): ReactNode {
  const parts = text.split(KHELO_CONTACT.phoneDisplay);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && <PhoneInline where={where} />}
    </Fragment>
  ));
}
