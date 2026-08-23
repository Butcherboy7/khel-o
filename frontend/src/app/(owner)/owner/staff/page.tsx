'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, EyeOff, Trash2, CheckCircle2, AlertCircle, Copy, Mail, Clock, XCircle } from 'lucide-react';
import { listOwnerStaff, deleteOwnerStaff } from '@/lib/api/owner';
import { createStaffInvitation, listStaffInvitations, cancelStaffInvitation, type StaffInvitation } from '@/lib/api/invitations';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-500" />
            <span>Staff Management & Access Control</span>
          </h1>
          <p className="text-caption text-text-secondary mt-1">
            Send secure invitations to venue staff. Staff members set their own credentials via an email or custom link.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsInviteOpen(true)}
          className="gap-2 w-full sm:w-auto justify-center whitespace-nowrap bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
        >
          <UserPlus className="h-4 w-4" />
          <span>Invite Staff</span>
        </Button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 p-4 rounded-2xl border text-caption font-semibold ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Staff Permission Isolation Callout */}
      <Card elevation="resting" className="bg-surface border border-border">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <EyeOff className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-caption font-bold text-text-primary">Finance & Dashboard Security</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Staff log in with their own secure account. They can perform check-ins and verify gamer QR passes, but financials, payout accounts, and store settings are strictly hidden.
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
          <h2 className="font-heading text-h2 text-text-primary">Active Venue Staff</h2>

          {staffList.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-surface-hover rounded-2xl">
              No staff members registered yet. Click &quot;Invite Staff&quot; above to send an email invitation.
            </div>
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

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsInviteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                >
                  Send Invitation
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
