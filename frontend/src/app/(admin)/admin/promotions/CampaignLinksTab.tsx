'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button, Input } from '@/components/ui';

const CHANNELS = ['whatsapp', 'instagram', 'college', 'influencer', 'referral', 'other'];

export function CampaignLinksTab() {
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);

  const slug = campaign.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'campaign';
  const url = `https://khel-o.com/?utm_source=${channel}&utm_medium=share&utm_campaign=${slug}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <p className="text-body text-text-secondary">
        Generate a trackable link. Anyone who registers after opening it is automatically
        attributed to this channel and campaign on the Marketing Attribution page.
      </p>

      <div>
        <label className="text-caption font-semibold text-text-secondary mb-1 block">Channel</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-body text-text-primary"
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <Input
        label="Campaign label"
        placeholder="e.g. september-launch"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
      />

      <div className="rounded-xl bg-surface border border-border p-3 flex items-center justify-between gap-2">
        <code className="text-caption break-all">{url}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
