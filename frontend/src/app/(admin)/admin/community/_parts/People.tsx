'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { downloadCommunityPeopleCsv, getCommunityOverview, getCommunityPeople, setCommunityGroupSize } from '@/lib/api/admin';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ErrorLine, Panel, SmallButton, field, when } from './ui';

export function People() {
  const qc = useQueryClient();
  const { data: o } = useQuery({ queryKey: ['admin', 'community'], queryFn: getCommunityOverview });
  const { data: people } = useQuery({ queryKey: ['admin', 'community-people'], queryFn: getCommunityPeople });
  const [size, setSize] = useState('');
  const [q, setQ] = useState('');
  const [onlyPromo, setOnlyPromo] = useState(false);
  const saveSize = useMutation({
    mutationFn: () => setCommunityGroupSize(Number(size)),
    onSuccess: () => {
      setSize('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (people ?? []).filter(
      (p) => (!onlyPromo || p.promoOk) && (!needle || [p.name, p.email, p.phone, p.source].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [people, q, onlyPromo]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Real WhatsApp group size" hint="WhatsApp does not tell us who joined. Open the group, read the member count, type it here.">
          <p className="text-body text-text-primary">
            Join taps: <b className="tabular-nums">{o?.members ?? 0}</b>
            {o?.groupSize ? <> · last typed <b className="tabular-nums">{o.groupSize.size}</b> on {when(o.groupSize.at)}</> : null}
          </p>
          {o?.groupSize && o.members > 0 ? (
            <p className="text-caption text-text-secondary">Tapped Join but are not in the group: about {Math.max(0, o.members - o.groupSize.size)}.</p>
          ) : null}
          <div className="flex gap-2">
            <input value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Members in the group" className={cn(field, 'flex-1')} />
            <Button onClick={() => saveSize.mutate()} disabled={saveSize.isPending || size === ''}>Save</Button>
          </div>
          <ErrorLine error={saveSize.error} />
        </Panel>
        <Panel title="Latest Join taps" hint="Anonymous phone = tapped Join without an account.">
          {!o?.recent.length && <p className="text-body text-text-secondary">Nobody yet.</p>}
          <ul className="flex max-h-[260px] flex-col overflow-auto">
            {o?.recent.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-caption last:border-0">
                <span className="min-w-0 truncate">
                  <b className="text-text-primary">{m.name || 'Anonymous phone'}</b>
                  {m.email ? ` · ${m.email}` : ''}
                  {m.source ? ` · ${m.source}` : ''}
                  {m.inApp ? ' · Instagram' : ''}
                </span>
                <span className="flex-shrink-0 text-text-secondary">{when(m.joinedAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title={`People we can contact · ${people?.length ?? 0}`}
        hint={<>Accounts that tapped Join, plus emails and numbers left on the page. Only &quot;Promos: yes&quot; people get the promotional email, sent from the <a href="/admin/community-email" className="font-bold text-primary underline">Community email</a> page.</>}
        action={<Button size="sm" variant="secondary" onClick={() => downloadCommunityPeopleCsv()}><Download className="mr-1 h-4 w-4" />Download CSV</Button>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, ad" className={cn(field, 'max-w-xs')} />
          <SmallButton active={onlyPromo} onClick={() => setOnlyPromo(!onlyPromo)}>Only promos: yes</SmallButton>
          <span className="text-caption text-text-secondary">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-body text-text-secondary">Nobody matches.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-caption">
              <thead className="sticky top-0 bg-card text-text-secondary">
                <tr>{['Name', 'Email', 'Phone', 'From', 'Promos', 'Date'].map((h) => <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 text-text-primary">{p.name || (p.kind === 'lead' ? 'Left on page' : 'Unnamed')}</td>
                    <td className="pr-3">{p.email || '·'}</td>
                    <td className="pr-3 tabular-nums">{p.phone || '·'}</td>
                    <td className="pr-3">{p.source || (p.kind === 'account' ? 'account' : 'direct')}</td>
                    <td className="pr-3">{p.promoOk ? 'yes' : 'no'}</td>
                    <td>{when(p.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
