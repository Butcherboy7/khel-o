'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Send, Clock, CheckCircle2, MessageCircle } from 'lucide-react';
import { Card, CardContent, Button, Badge, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { createSupportTicket, listMySupportTickets, type SupportTicket } from '@/lib/api/support';

const CATEGORIES = [
  { value: 'booking', label: 'Booking issue' },
  { value: 'payment', label: 'Payment / refund' },
  { value: 'cafe', label: 'Café experience' },
  { value: 'account', label: 'Account' },
  { value: 'general', label: 'Something else' },
];

function statusBadge(status: SupportTicket['status']) {
  if (status === 'open') return <Badge variant="warning" size="sm">Open</Badge>;
  if (status === 'in_progress') return <Badge variant="primary" size="sm">In progress</Badge>;
  if (status === 'resolved') return <Badge variant="success" size="sm">Resolved</Badge>;
  return <Badge variant="default" size="sm">Closed</Badge>;
}

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['support', 'my-tickets'],
    queryFn: () => listMySupportTickets({ limit: 20 }),
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () => createSupportTicket({ subject, description, category }),
    onSuccess: () => {
      setSubject('');
      setDescription('');
      setCategory('general');
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['support', 'my-tickets'] });
      setTimeout(() => setSubmitted(false), 4000);
    },
  });

  const canSubmit = subject.trim().length >= 3 && description.trim().length >= 10 && !createMut.isPending;

  return (
    <div className="flex flex-col gap-6 pb-12 px-4 pt-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Help & Support</h1>
      </div>
      <p className="text-caption text-text-secondary -mt-4">
        Ran into a problem with a booking, payment, or a café? Tell us what happened and the KHELO team will get back to you.
      </p>

      <Card elevation="resting">
        <CardContent className="p-4 flex flex-col gap-3">
          <div>
            <label className="text-caption font-semibold text-text-primary mb-1.5 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-primary mb-1.5 block">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary of the issue"
              maxLength={255}
              className="w-full h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="text-caption font-semibold text-text-primary mb-1.5 block">Details</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, and when? Include a booking reference if relevant."
              rows={4}
              maxLength={4000}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {createMut.isError && (
            <p className="text-caption text-error">Couldn&apos;t submit your ticket. Please try again.</p>
          )}
          {submitted && (
            <p className="text-caption text-success flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ticket submitted — we&apos;ll follow up soon.
            </p>
          )}

          <Button
            variant="primary"
            size="md"
            disabled={!canSubmit}
            onClick={() => createMut.mutate()}
            className="gap-2 self-start"
          >
            <Send className="h-4 w-4" />
            Submit ticket
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-caption font-semibold text-text-secondary uppercase tracking-wide">Your tickets</h2>

        {isLoading && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Couldn't load your tickets"
            message={(error as Error)?.message || 'Failed to fetch your support tickets. Please check your connection.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (data?.items?.length ?? 0) === 0 && (
          <EmptyState
            title="No tickets yet"
            description="Anything you report will show up here."
            icon={<MessageCircle className="h-8 w-8 text-text-tertiary" />}
          />
        )}

        {!isLoading && !isError && (data?.items?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2">
            {data!.items.map((t) => (
              <Card key={t.id} elevation="resting">
                <CardContent className="p-3.5 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-caption font-semibold text-text-primary">{t.subject}</p>
                    {statusBadge(t.status)}
                  </div>
                  <p className="text-[11px] text-text-tertiary line-clamp-2">{t.description}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                    <Clock className="h-3 w-3" />
                    {new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>
                  {t.adminNotes && (
                    <p className="mt-1 text-[11px] text-text-secondary bg-surface rounded-lg px-2.5 py-1.5">
                      <span className="font-semibold">KHELO team:</span> {t.adminNotes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
