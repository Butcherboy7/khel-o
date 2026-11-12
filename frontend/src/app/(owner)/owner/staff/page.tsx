'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, EyeOff, Trash2, CheckCircle2, AlertCircle, Copy, Mail, Clock, XCircle } from 'lucide-react';
import { listOwnerStaff, deleteOwnerStaff } from '@/lib/api/owner';
import { createStaffInvitation, listStaffInvitations, cancelStaffInvitation, type StaffInvitation } from '@/lib/api/invitations';
import { Card, CardContent, Button, Input, Badge, EmptyState, PageSpinner } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { InfoTip } from '@/components/shared/InfoTip';
import { INFO_TIPS } from '@/lib/ownerGuideCopy';
import { useAuthStore } from '@/store/authStore';

export default function OwnerStaffPage() {
  const router = useRouter();
  const activeRole = useAuthStore((s) => s.activeRole);

  // Staff can't invite/manage other staff — only the owner can. Bounces to
  // the dashboard instead of rendering a page whose actions would just 403.
  useEffect(() => {
    if (activeRole === 'staff') {
      router.push('/owner/dashboard');
    }
  }, [activeRole, router]);

  const [staffList, setStaffList] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  // Two-tap cancel for an invite, like Remove below.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', email: '', phoneNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  // Two-tap remove: the first tap asks, the second removes.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [staffRes, invRes] = await Promise.all([listOwnerStaff(), listStaffInvitations()]);
      setStaffList(staffRes.staff || []);
      setInvitations(invRes.invitations || []);
      setLoadError(null);
    } catch (e) {
      // Say so: an empty list here would read as "nobody yet" when the load simply failed.
      setLoadError(e ?? true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Escape closes the invite window.
  useEffect(() => {
    if (!isInviteOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsInviteOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isInviteOpen]);

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setIsSubmitting(true);

    try {
      const res = await createStaffInvitation(formData);
      setMsg({
        type: 'success',
        text: `Invite sent to ${res.invitation.email}. The link is below if you want to send it yourself.`
      });
      setFormData({ fullName: '', email: '', phoneNumber: '' });
      setIsInviteOpen(false);
      
      // Auto-copy invite URL if possible
      if (res.invitation?.inviteUrl && navigator.clipboard) {
        navigator.clipboard.writeText(res.invitation.inviteUrl).catch(() => {});
      }
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Couldn’t create staff invitation. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelInvitation = async (invId: string) => {
    try {
      await cancelStaffInvitation(invId);
      setMsg({ type: 'success', text: 'Invite cancelled.' });
      setConfirmCancelId(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Couldn’t cancel the invite. Please try again.' });
    }
  };

  const handleDeleteStaff = async (staffId: string, name: string) => {
    setRemovingId(staffId);
    try {
      await deleteOwnerStaff(staffId);
      setMsg({ type: 'success', text: `${name} removed. They can no longer check customers in or see your bookings.` });
      setConfirmRemoveId(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Couldn’t remove them. Please try again.' });
    } finally {
      setRemovingId(null);
    }
  };

  // Accepted invites already show up as a person below and cancelled ones
  // are done with; only the ones still waiting (or lapsed) need attention.
  const openInvitations = invitations.filter((i) => i.status === 'pending' || i.status === 'expired');

  const copyLink = (url: string, token: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (isLoading) {
    return (
      <PageSpinner showTip />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <OwnerPageHeader
        guide="staff"
        title="Your team"
        description="Give the people working your desk their own login, so nobody has to share yours."
        action={
          <Button
            variant="primary"
            onClick={() => setIsInviteOpen(true)}
            className="w-full justify-center gap-2 whitespace-nowrap sm:w-auto"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Invite someone</span>
          </Button>
        }
      />

      {msg && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-2xl border p-4 text-caption font-semibold ${
            msg.type === 'success'
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-error/20 bg-error/10 text-error'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {Boolean(loadError) && (
        <OwnerLoadError error={loadError} title="Couldn’t load your team" message="Check your connection and try again." onRetry={() => { setIsLoading(true); loadData(); }} />
      )}

      {/* What staff can and can't see — said before anyone is invited, because
          "will they see my money?" is the question that stops an owner here. */}
      <Card elevation="resting" className="border border-border bg-surface">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600">
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading text-body font-bold text-text-primary">
                Staff never see your money
              </h3>
              <p className="mt-0.5 max-w-prose text-caption text-text-secondary">
                They can check customers in and scan passes. Earnings, payouts, bank details and
                café settings stay yours alone.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations Section */}
      {!loadError && openInvitations.length > 0 && (
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                <Mail className="h-5 w-5 text-indigo-400" />
                <span>Invited, not joined yet</span>
                <InfoTip text={INFO_TIPS.staffInvitations} label="About invitations" />
              </h2>
              <Badge variant="default" size="sm">{openInvitations.filter(i => i.status === 'pending').length} waiting</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {openInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 rounded-2xl bg-surface-hover border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                      {inv.fullName[0]?.toUpperCase() || 'I'}
                    </div>
                    <div>
                      <span className="font-heading text-body font-bold text-text-primary block">{inv.fullName}</span>
                      <span className="text-caption text-text-secondary">{inv.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-caption text-text-tertiary flex items-center gap-1 mr-2">
                      <Clock className="h-3.5 w-3.5" />
                      Link works until {new Date(inv.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>

                    {inv.status === 'pending' && (
                      <>
                        <Badge variant="warning" size="sm">Waiting</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyLink(inv.inviteUrl, inv.token)}
                          className="gap-1.5 text-xs"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>{copiedToken === inv.token ? 'Copied!' : 'Copy link'}</span>
                        </Button>
                        {confirmCancelId === inv.id ? (
                          <span className="flex items-center gap-2" role="group" aria-label={`Cancel the invite for ${inv.fullName}?`}>
                            <Button variant="destructive" size="sm" onClick={() => handleCancelInvitation(inv.id)}>Cancel invite</Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmCancelId(null)}>Keep</Button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(inv.id)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-caption font-semibold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                          >
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            Cancel invite
                          </button>
                        )}
                      </>
                    )}

                    {inv.status === 'accepted' && (
                      <Badge variant="success" size="sm">Accepted</Badge>
                    )}

                    {inv.status === 'cancelled' && (
                      <Badge variant="default" size="sm">Cancelled</Badge>
                    )}

                    {inv.status === 'expired' && (
                      <>
                        <Badge variant="error" size="sm">Expired</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormData({ fullName: inv.fullName, email: inv.email, phoneNumber: '' });
                            setIsInviteOpen(true);
                          }}
                        >
                          Invite again
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff List */}
      {!loadError && <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
            People with a login
            <InfoTip text={INFO_TIPS.staffRemove} label="About removing staff" />
          </h2>

          {staffList.length === 0 ? (
            // The old copy pointed at a button that, by the time you had scrolled
            // here on a phone, was off the top of the screen. This one carries
            // the action with it.
            <EmptyState
              bare
              icon={<Users className="h-7 w-7" aria-hidden="true" />}
              title="Nobody yet"
              description="Invite a staff member and they'll get an email to set their own password. You stay the only one who can see the money."
              actionLabel="Invite someone"
              onAction={() => setIsInviteOpen(true)}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {staffList.map((member) => (
                <div
                  key={member.id}
                  className="p-4 rounded-2xl bg-surface-hover border border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                      {member.fullName[0]?.toUpperCase() || 'S'}
                    </div>
                    <div>
                      <span className="font-heading text-body font-bold text-text-primary block">{member.fullName}</span>
                      <span className="text-caption text-text-secondary">{member.email}</span>
                    </div>
                  </div>

                  {confirmRemoveId === member.id ? (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Remove ${member.fullName}?`}>
                      <span className="text-caption text-text-secondary">Remove {member.fullName.split(' ')[0]}? Access ends right away.</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        isLoading={removingId === member.id}
                        onClick={() => handleDeleteStaff(member.id, member.fullName)}
                      >
                        Remove
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveId(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Badge variant="success" size="sm">Can check customers in</Badge>
                      <button
                        onClick={() => setConfirmRemoveId(member.id)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-caption font-semibold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                        aria-label={`Remove ${member.fullName} from your team`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Invite Modal */}
      {isInviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setIsInviteOpen(false)}
        >
          <Card role="dialog" aria-modal="true" aria-label="Invite someone to your team"
             elevation="raised" className="max-w-md w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-h3 text-text-primary">Invite someone to your team</h3>
              <button type="button" onClick={() => setIsInviteOpen(false)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-text-tertiary font-bold hover:bg-surface-hover">✕</button>
            </div>

            <p className="text-caption text-text-secondary">
              We’ll email them a link to set their own password. You can also copy the link and send it yourself.
            </p>

            <form onSubmit={handleInviteSubmit} className="flex flex-col gap-4">
              <Input
                label="Their name"
                placeholder="e.g. Rahul Sharma"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />

              <Input
                label="Their email"
                type="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />

              <Input
                label="Their phone (optional)"
                placeholder="+91 98765 43210"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              />

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => setIsInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting} loadingText="Sending">
                  Send invitation
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
