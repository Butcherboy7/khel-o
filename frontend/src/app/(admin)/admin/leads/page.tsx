'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Copy, Check, Megaphone, ChevronDown, ChevronUp } from 'lucide-react';
import { listCafeDemand, updateCafeWaitlistGoal, type CafeDemandLead } from '@/lib/api/admin';
import { Card, CardContent, Badge, ErrorState, EmptyState, PageSpinner } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';

// Outreach-facing: which unlisted/lead cafés have the most "Notify me"
// demand, and the contact details of everyone who asked — the pitch data
// ("37 people requested you") and the reach-out list in one place.
export default function AdminLeadsPage() {
  const queryClient = useQueryClient();
  const [expandedCafeId, setExpandedCafeId] = useState<string | null>(null);
  const [copiedCafeId, setCopiedCafeId] = useState<string | null>(null);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});

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
                      <span>{lead.contacts.length} contact{lead.contacts.length === 1 ? '' : 's'} collected</span>
                      {lead.noContactCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{lead.noContactCount} via account</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
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

                      <button
                        onClick={() => setExpandedCafeId(isExpanded ? null : lead.cafeId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text-primary hover:bg-surface transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {isExpanded ? 'Hide' : 'View'} contacts
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="rounded-xl bg-surface p-3 flex flex-col gap-1">
                      {lead.contacts.length === 0 ? (
                        <p className="text-caption text-text-secondary">
                          No phone/email left — every requester here is a signed-in account.
                        </p>
                      ) : (
                        lead.contacts.map((contact, idx) => (
                          <span key={idx} className="text-caption text-text-primary font-mono">{contact}</span>
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
