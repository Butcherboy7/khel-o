'use client';

import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { submitContactMessage } from '@/lib/api/contact';

const CATEGORIES = [
  { value: 'general', label: 'General question' },
  { value: 'cafe_partner', label: "I'm a café owner" },
  { value: 'booking', label: 'Booking or payment issue' },
] as const;

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('general');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      await submitContactMessage({ name, email, category, message, company });
      setStatus('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="not-prose rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-body font-semibold text-text-primary">Thanks — we got your message.</p>
        <p className="text-caption text-text-secondary mt-1">We usually respond within 1–2 business days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="not-prose rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
      {/* Honeypot — hidden from real visitors via CSS, not display:none, so it still registers a fill from naive bots. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-category" className="text-h4 text-text-primary">
          I&apos;m reaching out about
        </label>
        <select
          id="contact-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number]['value'])}
          className="w-full rounded-xl border border-border bg-card font-body text-body text-text-primary h-input px-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        label="Message"
        required
        minLength={10}
        maxLength={4000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="How can we help?"
      />

      {status === 'error' && (
        <p className="text-caption text-error" role="alert">
          Something went wrong sending your message — please try again or email us directly.
        </p>
      )}

      <Button type="submit" isLoading={status === 'submitting'} loadingText="Sending…" className="self-start">
        <Send className="h-4 w-4" />
        Send message
      </Button>
    </form>
  );
}
