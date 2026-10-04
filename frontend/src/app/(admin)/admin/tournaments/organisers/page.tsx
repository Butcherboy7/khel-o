'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Store, X } from 'lucide-react';
import {
  addOrganiserMember,
  createOrganiser,
  listOrganisers,
  removeOrganiserMember,
  type AdminOrganiser,
} from '@/lib/api/tournaments';
import { Button, ErrorState, Input, Select, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';

function OrganiserCard({ o }: { o: AdminOrganiser }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('staff');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['admin-organisers'] });
      setEmail('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        {o.kind === 'cafe' ? <Store className="h-4 w-4 text-text-secondary" aria-hidden /> : <Building2 className="h-4 w-4 text-text-secondary" aria-hidden />}
        <span className="font-heading text-h3 text-text-primary">{o.name}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-caption font-bold text-text-secondary">{o.kind === 'khelo' ? 'KHEL-O' : o.kind}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {o.members.map((m) => (
          <li key={m.userId} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-caption">
            <span className="font-semibold text-text-primary">{m.name}</span>
            <span className="text-text-secondary">{m.email} · {m.role}</span>
            <button type="button" aria-label={`Remove ${m.name}`} className="text-text-secondary hover:text-error" onClick={() => act(() => removeOrganiserMember(o.id, m.userId))}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
        {!o.members.length && <li className="text-caption text-text-secondary">No members. Admins can run it.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => addOrganiserMember(o.id, email, role));
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <Input aria-label="Member email" type="email" placeholder="Their KHEL-O account email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}>
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </Select>
        <Button type="submit" variant="secondary" isLoading={busy}>Add member</Button>
      </form>
      {error && <p role="alert" className="text-caption text-error">{error}</p>}
    </li>
  );
}

export default function OrganisersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-organisers'], queryFn: listOrganisers });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createOrganiser({ name, kind: 'company', memberEmail: email || undefined });
      await qc.invalidateQueries({ queryKey: ['admin-organisers'] });
      setName('');
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const companies = (data ?? []).filter((o) => o.kind !== 'cafe');
  const cafes = (data ?? []).filter((o) => o.kind === 'cafe');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-16">
      <Link href="/admin/tournaments" className="inline-flex w-fit items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Tournaments
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-h1 text-text-primary">Organisers</h1>
        <p className="max-w-2xl text-body text-text-secondary">
          A company (an esports brand, a college club, a sponsor) can run tournaments at any partner café. Add the company here, then add
          the people who run it. They sign in with their normal KHEL-O account and open <strong>/host</strong>. Cafés become organisers on
          their own the first time the owner opens Tournaments.
        </p>
      </div>

      <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-heading text-h3 text-text-primary">Add a company</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
          <Input label="First member's email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="They must already have a KHEL-O account" />
        </div>
        {error && <p role="alert" className="text-caption text-error">{error}</p>}
        <Button type="submit" className="w-fit" isLoading={busy}>Add company</Button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-overline uppercase text-text-secondary">KHEL-O and companies</h2>
        <ul className="flex flex-col gap-3">{companies.map((o) => <OrganiserCard key={o.id} o={o} />)}</ul>
      </section>
      {cafes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-overline uppercase text-text-secondary">Cafés</h2>
          <ul className="flex flex-col gap-3">{cafes.map((o) => <OrganiserCard key={o.id} o={o} />)}</ul>
        </section>
      )}
    </div>
  );
}
