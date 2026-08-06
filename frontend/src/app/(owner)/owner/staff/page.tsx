'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Users, UserPlus, ShieldCheck, EyeOff, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { listOwnerStaff, createOwnerStaff, deleteOwnerStaff } from '@/lib/api/owner';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';

export default function OwnerStaffPage() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '', phoneNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStaff = async () => {
    try {
      const res = await listOwnerStaff();
      setStaffList(res.staff || []);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setIsSubmitting(true);

    try {
      await createOwnerStaff(formData);
      setMsg({ type: 'success', text: 'Staff account created successfully!' });
      setFormData({ fullName: '', email: '', password: '', phoneNumber: '' });
      setIsInviteOpen(false);
      loadStaff();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Failed to create staff user.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (staffId: string) => {
    try {
      await deleteOwnerStaff(staffId);
      setMsg({ type: 'success', text: 'Staff member deactivated.' });
      loadStaff();
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message || 'Failed to deactivate staff.' });
    }
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
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-500" />
            <span>Staff Management & Access Control</span>
          </h1>
          <p className="text-caption text-text-secondary">Invite venue staff to verify gamer QR check-ins. Staff accounts are isolated from financial metrics.</p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsInviteOpen(true)}
          className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
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
          {msg.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
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
              <h3 className="font-heading text-caption font-bold text-text-primary">Finance Isolation Guarantee</h3>
              <p className="text-xs text-text-secondary">
                Staff members log in with their own credentials and are automatically restricted to the 1-Tap Check-In and Session Verification feed. Financial earnings, bank accounts, platform fees, and pricing remain 100% hidden.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff List */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary">Active Venue Staff</h2>

          {staffList.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-surface-hover rounded-2xl">
              No staff members invited yet. Click &quot;Invite Staff&quot; above to create staff credentials.
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
                      onClick={() => handleDelete(member.id)}
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
              <h3 className="font-heading text-h3 text-text-primary">Invite Venue Staff</h3>
              <button onClick={() => setIsInviteOpen(false)} className="text-text-tertiary font-bold">✕</button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                label="Staff Full Name *"
                placeholder="e.g. Rahul Sharma"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />

              <Input
                label="Staff Email *"
                type="email"
                placeholder="staff@esportsarena.in"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />

              <Input
                label="Staff Password *"
                type="password"
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                  Create Staff Credentials
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
