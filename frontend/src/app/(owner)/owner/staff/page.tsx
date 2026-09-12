'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, EyeOff, Trash2, CheckCircle2, AlertCircle, Copy, Mail, Clock, XCircle } from 'lucide-react';
import { listOwnerStaff, deleteOwnerStaff } from '@/lib/api/owner';
import { createStaffInvitation, listStaffInvitations, cancelStaffInvitation, type StaffInvitation } from '@/lib/api/invitations';
import { Card, CardContent, Button, Input, Badge, EmptyState, PageSpinner } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
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

  const [staffList, setStaffList] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', email: '', phoneNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [staffRes, invRes] = await Promise.all([
        listOwnerStaff().catch(() => ({ staff: [] })),
        listStaffInvitations().catch(() => ({ invitations: [] }))
      ]);
      setStaffList(staffRes.staff || []);
      setInvitations(invRes.invitations || []);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setIsSubmitting(true);

    try {
      const res = await createStaffInvitation(formData);
      setMsg({
        type: 'success',
        text: `Invitation sent to ${res.invitation.email}! Link copied to clipboard or ready to copy below.`
      });
      setFormData({ fullName: '', email: '', phoneNumber: '' });
      setIsInviteOpen(false);
      
      // Auto-copy invite URL if possible
      if (res.invitation?.inviteUrl && navigator.clipboard) {
        navigator.clipboard.writeText(res.invitation.inviteUrl).catch(() => {});
      }
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Failed to create staff invitation.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelInvitation = async (invId: string) => {
    try {
      await cancelStaffInvitation(invId);
      setMsg({ type: 'success', text: 'Staff invitation cancelled.' });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Failed to cancel invitation.' });
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    try {
      await deleteOwnerStaff(staffId);
      setMsg({ type: 'success', text: 'Staff member deactivated.' });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Failed to deactivate staff.' });
    }
  };

  const copyLink = (url: string, token: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (isLoading) {
    return (
      <PageSpinner />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <OwnerPageHeader
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
      {invitations.length > 0 && (
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                <Mail className="h-5 w-5 text-indigo-400" />
                <span>Pending Invitations</span>
              </h2>
              <Badge variant="default" size="sm">{invitations.filter(i => i.status === 'pending').length} Pending</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {invitations.map((inv) => (
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
                      Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>

                    {inv.status === 'pending' && (
                      <>
                        <Badge variant="warning" size="sm">Pending</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyLink(inv.inviteUrl, inv.token)}
                          className="gap-1.5 text-xs"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>{copiedToken === inv.token ? 'Copied!' : 'Copy Link'}</span>
                        </Button>
                        <button
                          onClick={() => handleCancelInvitation(inv.id)}
                          className="text-rose-500 hover:text-rose-600 p-1.5"
                          title="Cancel Invitation"
                          aria-label="Cancel invitation"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}

                    {inv.status === 'accepted' && (
                      <Badge variant="success" size="sm">Accepted</Badge>
                    )}

                    {inv.status === 'cancelled' && (
                      <Badge variant="default" size="sm">Cancelled</Badge>
                    )}

                    {inv.status === 'expired' && (
                      <Badge variant="error" size="sm">Expired</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff List */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary">People with a login</h2>

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
                  className="p-4 rounded-2xl bg-surface-hover border border-border flex items-center justify-between gap-4"
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

                  <div className="flex items-center gap-3">
                    <Badge variant="success" size="sm">Check-In Staff</Badge>
                    <button
                      onClick={() => handleDeleteStaff(member.id)}
                      className="text-rose-500 hover:text-rose-600 p-2"
                      title="Deactivate staff account"
                      aria-label="Deactivate staff account"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card elevation="raised" className="max-w-md w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-h3 text-text-primary">Invite Venue Staff Member</h3>
              <button onClick={() => setIsInviteOpen(false)} className="text-text-tertiary font-bold">✕</button>
            </div>

            <p className="text-caption text-text-secondary">
              An invitation email with setup instructions will be sent via Resend. You can also copy the invitation link directly.
            </p>

            <form onSubmit={handleInviteSubmit} className="flex flex-col gap-4">
              <Input
                label="Staff Full Name *"
                placeholder="e.g. Rahul Sharma"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />

              <Input
                label="Staff Email Address *"
                type="email"
                placeholder="staff@esportsarena.in"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />

              <Input
                label="Phone Number (Optional)"
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
