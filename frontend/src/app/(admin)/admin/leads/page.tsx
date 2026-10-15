'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Copy, Check, Megaphone, ChevronDown, ChevronUp, Download, Mail, Link2, MessageCircle, Phone, Handshake } from 'lucide-react';
import { listCafeDemand, updateCafeWaitlistGoal, downloadWaitlistCsv, type CafeDemandLead, type WaitlistPerson } from '@/lib/api/admin';
import { WaitlistBroadcast } from '@/components/admin/WaitlistBroadcast';
import { Card, CardContent, Badge, ErrorState, EmptyState, PageSpinner } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';

const PLAY_TIME_LABELS: Record<string, string> = {
  weekday_evenings: 'Weekday evenings',
  weekends: 'Weekends',
  late_nights: 'Late nights',
};

/** wa.me wants the number with country code and no symbols; a bare 10-digit
 *  Indian mobile gets +91. */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

function PersonRow({ person, cafeName }: { person: WaitlistPerson; cafeName: string }) {
  const hello = encodeURIComponent(
    `Hi${person.name ? ` ${person.name.split(' ')[0]}` : ''}! This is KHEL-O — you asked us to bring ${cafeName} onto KHEL-O.`,
  );
  const linkClass =
    'inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-caption font-semibold text-text-primary hover:bg-surface';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption font-semibold text-text-primary">{person.name || 'Guest'}</span>
          {person.knowsOwner && (
            <Badge variant="success" size="sm">Knows the owner</Badge>
          )}
          {person.contactMethod && (
            <Badge variant="default" size="sm">
              Prefers {person.contactMethod === 'whatsapp' ? 'WhatsApp' : person.contactMethod}
            </Badge>
          )}
        </div>
        <p className="text-caption text-text-secondary font-mono break-all">
          {[person.phone, person.email].filter(Boolean).join(' · ') || 'No contact left'}
          {person.playTime && <span className="font-sans"> · {PLAY_TIME_LABELS[person.playTime] ?? person.playTime}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {person.phone && (
          <>
            <a href={`https://wa.me/${waNumber(person.phone)}?text=${hello}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <a href={`tel:${person.phone}`} className={linkClass}>
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          </>
        )}
        {person.email && (
          <a href={`mailto:${person.email}`} className={linkClass}>
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        )}
      </div>
    </div>
  );
}

// Outreach-facing: which unlisted/lead cafés have the most "Notify me"
// demand, and the contact details of everyone who asked — the pitch data
// ("37 people requested you") and the reach-out list in one place.
export default function AdminLeadsPage() {
  const queryClient = useQueryClient();
  const [expandedCafeId, setExpandedCafeId] = useState<string | null>(null);
  const [copiedCafeId, setCopiedCafeId] = useState<string | null>(null);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [composeCafeId, setComposeCafeId] = useState<string | null>(null);
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'leads-demand'],
    queryFn: () => listCafeDemand(1),
    staleTime: 30_000,
  });

  const updateGoal = useMutation({
    mutationFn: ({ cafeId, goal }: { cafeId: string; goal: number }) => updateCafeWaitlistGoal(cafeId, goal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'leads-demand'] }),
  });

  const leads = data?.leads ?? [];

  const handleCopyContacts = async (lead: CafeDemandLead) => {
    const text = lead.contacts.join('\n');
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedCafeId(lead.cafeId);
    setTimeout(() => setCopiedCafeId(null), 2000);
  };

  const handleExport = async (cafeId?: string) => {
    setExporting(cafeId ?? 'all');
    try {
      await downloadWaitlistCsv(cafeId);
    } finally {
      setExporting(null);
    }
  };

  // The owner pitch link: live counts, no names or contacts, not indexed.
  const handleCopyDemandLink = async (lead: CafeDemandLead) => {
    if (!lead.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/demand/${lead.slug}`);
    setLinkCopiedId(lead.cafeId);
    setTimeout(() => setLinkCopiedId(null), 2000);
  };

  const actionClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text-primary hover:bg-surface disabled:opacity-40 transition-colors';

  if (isLoading) return <PageSpinner label="Loading café demand" />;
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load café demand"
        message={(error as Error)?.message || 'Failed to fetch waitlist data.'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          Café Demand
        </h1>
        <p className="text-body text-text-secondary mt-0.5">
          Cafés ranked by how many players tapped &ldquo;Notify me&rdquo; — the pitch data and the reach-out
          contact list for outreach, in one place.
        </p>
      </div>
        {leads.length > 0 && (
          <button onClick={() => handleExport()} disabled={exporting !== null} className={actionClass}>
            <Download className="h-3.5 w-3.5" />
            {exporting === 'all' ? 'Exporting…' : 'Export all (CSV)'}
          </button>
        )}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No demand yet"
          description="No one has requested a café that isn't bookable yet. Check back once lead listings start collecting interest."
          icon={<Users className="h-7 w-7 text-primary" />}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {leads.map((lead) => {
            const percent = Math.min(100, Math.round((lead.count / lead.waitlistGoal) * 100));
            const isExpanded = expandedCafeId === lead.cafeId;
            const draftGoal = goalDrafts[lead.cafeId] ?? String(lead.waitlistGoal);

            return (
              <Card key={lead.cafeId} elevation="resting" className="border border-border/80">
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-heading text-body-emphasis font-bold text-text-primary truncate">
                          {lead.cafeName}
                        </h3>
                        {lead.isLeadListing ? (
                          <Badge variant="warning" size="sm">Not yet listed</Badge>
                        ) : (
                          <Badge variant="success" size="sm">Live café</Badge>
                        )}
                      </div>
                      <p className="text-caption text-text-secondary">{lead.city}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-heading text-h3 font-bold text-primary">{lead.count}</span>
                      <p className="text-caption text-text-secondary">requested</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-caption text-text-secondary">
                      <span>{lead.count} / {lead.waitlistGoal} goal</span>
                      <span>{percent}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-caption text-text-secondary">
                      <span>First request {formatRelativeTime(lead.firstRequestedAt)}</span>
                      <span>·</span>
                      <span>{lead.phoneCount ?? 0} with a number</span>
                      {(lead.knowsOwnerCount ?? 0) > 0 && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-success">
                            <Handshake className="h-3.5 w-3.5" />
                            {lead.knowsOwnerCount} know{lead.knowsOwnerCount === 1 ? 's' : ''} the owner
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{lead.emailableCount} emailable</span>
                      {lead.noContactCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{lead.noContactCount} unreachable</span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-caption text-text-secondary">
                        Goal
                        <input
                          type="number"
                          min={1}
                          value={draftGoal}
                          onChange={(e) => setGoalDrafts((prev) => ({ ...prev, [lead.cafeId]: e.target.value }))}
                          onBlur={() => {
                            const parsed = parseInt(draftGoal, 10);
                            if (parsed > 0 && parsed !== lead.waitlistGoal) {
                              updateGoal.mutate({ cafeId: lead.cafeId, goal: parsed });
                            }
                          }}
                          className="w-16 min-h-[32px] rounded-lg border border-border bg-card px-2 text-caption text-text-primary"
                        />
                      </label>

                      <button
                        onClick={() => handleCopyContacts(lead)}
                        disabled={lead.contacts.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text-primary hover:bg-surface disabled:opacity-40 transition-colors"
                      >
                        {copiedCafeId === lead.cafeId ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-success" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy contacts
                          </>
                        )}
                      </button>

                      <button onClick={() => handleExport(lead.cafeId)} disabled={exporting !== null} className={actionClass}>
                        <Download className="h-3.5 w-3.5" />
                        {exporting === lead.cafeId ? 'Exporting…' : 'CSV'}
                      </button>

                      <button
                        onClick={() => setComposeCafeId(composeCafeId === lead.cafeId ? null : lead.cafeId)}
                        disabled={lead.emailableCount === 0}
                        className={actionClass}
                      >
                        <Mail className="h-3.5 w-3.5" /> Email list
                      </button>

                      {lead.slug && (
                        <button onClick={() => handleCopyDemandLink(lead)} className={actionClass}>
                          {linkCopiedId === lead.cafeId ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-success" /> Copied
                            </>
                          ) : (
                            <>
                              <Link2 className="h-3.5 w-3.5" /> Owner link
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => setExpandedCafeId(isExpanded ? null : lead.cafeId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text-primary hover:bg-surface transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {isExpanded ? 'Hide' : 'View'} people
                      </button>
                    </div>
                  </div>

                  {composeCafeId === lead.cafeId && (
                    <WaitlistBroadcast lead={lead} onClose={() => setComposeCafeId(null)} />
                  )}

                  {isExpanded && (
                    <div className="rounded-xl bg-surface px-3 py-1 flex flex-col divide-y divide-border">
                      {(lead.people ?? []).length === 0 ? (
                        <p className="py-2 text-caption text-text-secondary">No one has requested this café yet.</p>
                      ) : (
                        lead.people.map((person, idx) => (
                          <PersonRow key={`${person.joinedAt}-${idx}`} person={person} cafeName={lead.cafeName} />
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
