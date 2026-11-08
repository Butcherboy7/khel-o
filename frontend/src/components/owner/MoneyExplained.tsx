'use client';

import { useEffect, useState } from 'react';
import { Banknote, Coins, Store, Undo2, Wallet, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type Lang = 'en' | 'hi' | 'te';

const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'te', label: 'తెలుగు' },
];

const KEY = 'khelo_money_lang_v1';

interface Props {
  pricePerHour: number;
  deposit: number;
  /** Example length. 2 hours is the common one. */
  hours?: number;
  className?: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * The money of a launch drop in the simplest words, with one worked example
 * using the café's own prices. Hindi and Telugu are one tap away so nobody has
 * to read English to understand where the money goes.
 */
export function MoneyExplained({ pricePerHour, deposit, hours = 2, className }: Props) {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Lang | null;
      if (saved === 'hi' || saved === 'te' || saved === 'en') setLang(saved);
    } catch {}
  }, []);
  const pick = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  };

  const total = pricePerHour * hours;
  const rest = Math.max(0, total - deposit);

  const T = {
    en: {
      title: 'Where the money goes',
      sub: `Example: a customer plays ${hours} hours.`,
      rows: [
        ['Total for the customer', inr(total), `${hours} hours × ${inr(pricePerHour)} an hour.`],
        ['Customer pays online, now', inr(deposit), 'This small fee keeps the seat. It comes off the total.'],
        ['Customer pays at your café', inr(rest), 'The rest. Collect it when they arrive, cash or UPI.'],
      ],
      notes: [
        ['If the customer does not come', `The ${inr(deposit)} is not given back to the customer.`],
        ['If you cancel the drop', 'Everyone gets all their money back by themselves. You do nothing.'],
        ['How you get the online money', 'KHEL-O sends it to your UPI or bank. See the Payouts page.'],
      ],
    },
    hi: {
      title: 'पैसा कहाँ जाता है',
      sub: `उदाहरण: ग्राहक ${hours} घंटे खेलता है।`,
      rows: [
        ['ग्राहक का कुल बिल', inr(total), `${hours} घंटे × ${inr(pricePerHour)} प्रति घंटा।`],
        ['ग्राहक अभी ऑनलाइन देता है', inr(deposit), 'यह छोटी फीस सीट पक्की करती है। यह कुल बिल में से कट जाती है।'],
        ['ग्राहक आपके कैफ़े में देता है', inr(rest), 'बाकी पैसा। ग्राहक के आने पर कैश या UPI से लें।'],
      ],
      notes: [
        ['अगर ग्राहक नहीं आता', `${inr(deposit)} ग्राहक को वापस नहीं मिलते।`],
        ['अगर आप ड्रॉप रद्द करते हैं', 'सबको पूरे पैसे अपने आप वापस मिल जाते हैं। आपको कुछ नहीं करना।'],
        ['ऑनलाइन पैसा आपको कैसे मिलेगा', 'KHEL-O उसे आपके UPI या बैंक में भेजता है। “Payouts” पेज देखें।'],
      ],
    },
    te: {
      title: 'డబ్బు ఎక్కడికి వెళ్తుంది',
      sub: `ఉదాహరణ: కస్టమర్ ${hours} గంటలు ఆడతారు.`,
      rows: [
        ['కస్టమర్ మొత్తం బిల్', inr(total), `${hours} గంటలు × గంటకు ${inr(pricePerHour)}.`],
        ['కస్టమర్ ఇప్పుడు ఆన్‌లైన్‌లో చెల్లిస్తారు', inr(deposit), 'ఈ చిన్న ఫీజు సీటును ఖాయం చేస్తుంది. ఇది మొత్తం బిల్లులో తగ్గుతుంది.'],
        ['కస్టమర్ మీ కేఫ్‌లో చెల్లిస్తారు', inr(rest), 'మిగతా డబ్బు. వచ్చినప్పుడు క్యాష్ లేదా UPI తో తీసుకోండి.'],
      ],
      notes: [
        ['కస్టమర్ రాకపోతే', `${inr(deposit)} కస్టమర్‌కు తిరిగి ఇవ్వరు.`],
        ['మీరు డ్రాప్ రద్దు చేస్తే', 'అందరికీ మొత్తం డబ్బు ఆటోమేటిక్‌గా తిరిగి వెళ్తుంది. మీరు ఏమీ చేయక్కర్లేదు.'],
        ['ఆన్‌లైన్ డబ్బు మీకు ఎలా వస్తుంది', 'KHEL-O దాన్ని మీ UPI లేదా బ్యాంకుకు పంపుతుంది. “Payouts” పేజీ చూడండి.'],
      ],
    },
  }[lang];

  const icons = [Coins, Wallet, Store];
  const noteIcons = [XCircle, Undo2, Banknote];

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4', className)} aria-label={T.title} lang={lang}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-body-emphasis font-bold text-text-primary">{T.title}</h2>
          <p className="text-caption text-text-secondary">{T.sub}</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => pick(l.id)}
              aria-pressed={lang === l.id}
              className={cn(
                'min-h-[36px] rounded-full border px-3 text-caption font-semibold',
                lang === l.id ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text-secondary',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {T.rows.map(([label, amount, help], i) => {
          const Icon = icons[i];
          return (
            <li key={label} className="flex items-center gap-3 rounded-xl bg-surface p-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-text-primary">{label}</span>
                <span className="block text-caption text-text-secondary">{help}</span>
              </span>
              <span className="flex-shrink-0 font-heading text-h3 font-bold text-text-primary">{amount}</span>
            </li>
          );
        })}
      </ol>

      <ul className="mt-3 flex flex-col gap-2">
        {T.notes.map(([q, a], i) => {
          const Icon = noteIcons[i];
          return (
            <li key={q} className="flex items-start gap-2.5 text-body">
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary" aria-hidden />
              <span>
                <span className="font-semibold text-text-primary">{q}: </span>
                <span className="text-text-secondary">{a}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
