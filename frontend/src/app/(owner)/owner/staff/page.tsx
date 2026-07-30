'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, UserPlus, ShieldCheck, Mail, Phone, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { listStaff, createStaff } from '@/lib/api';

export default function StaffManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: staffMembers = [], isLoading, isError } = useQuery({
    queryKey: ['ownerStaff'],
    queryFn: listStaff,
    staleTime: 60_000,
  });

  const staffMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerStaff'] });
      setSuccessMsg('Staff member added successfully! They can log in with their email.');
      setFullName('');
      setEmail('');
      setPassword('');
      setPhoneNumber('');
      setTimeout(() => {
        setShowAddModal(false);
        setSuccessMsg(null);
      }, 2000);
    },
    onError: (err: unknown) => {
      const errObj = err as { response?: { data?: { error?: { message?: string }; detail?: string } } };
      const msg = errObj?.response?.data?.error?.message || errObj?.response?.data?.detail || 'Failed to create staff account.';
      setErrorMsg(msg);
    },
  });

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    staffMutation.mutate({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      phoneNumber: phoneNumber.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6 pb-24 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/owner/dashboard"
            className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold font-heading text-text-primary">
              Staff Management
            </h1>
            <p className="text-xs text-text-secondary">
              Create and manage staff accounts for QR check-ins
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Staff Role Explanation Card */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-start space-x-3 shadow-sm">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl flex-shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="text-xs space-y-1">
          <h3 className="font-heading font-semibold text-text-primary text-sm">
            Staff Access Privileges
          </h3>
          <p className="text-text-secondary leading-relaxed">
            Staff members can log into KHEL-O to access the QR Code Scanner, verify bookings, and check in arriving gamers. They cannot modify café settings, pricing, or financial payouts.
          </p>
        </div>
      </div>

      {/* Staff List */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="card-base h-20 animate-pulse" />
          <div className="card-base h-20 animate-pulse" />
        </div>
      ) : isError ? (
        <div className="card-base p-6 text-center text-text-secondary text-sm">
          Unable to load staff accounts.
        </div>
      ) : staffMembers.length === 0 ? (
        <div className="card-base p-8 text-center flex flex-col items-center justify-center space-y-3">
          <Users className="w-10 h-10 text-text-secondary/40" />
          <h3 className="font-heading font-semibold text-base text-text-primary">
            No staff accounts yet
          </h3>
          <p className="text-xs text-text-secondary max-w-sm">
            Click "Add Staff Member" to delegate customer check-ins and QR scanning to your café staff.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {staffMembers.map((member) => (
            <div key={member.id} className="card-base p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h4 className="font-heading font-semibold text-sm text-text-primary">
                    {member.fullName}
                  </h4>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full font-data">
                    STAFF
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-text-secondary font-data">
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  <span>{member.email}</span>
                </div>
                {member.phoneNumber && (
                  <div className="flex items-center space-x-2 text-xs text-text-secondary font-data">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                    <span>{member.phoneNumber}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h2 className="font-heading font-bold text-lg text-text-primary flex items-center space-x-2">
              <UserPlus className="w-5 h-5 text-primary" />
              <span>New Staff Account</span>
            </h2>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs font-body">
              <div>
                <label className="block text-text-secondary font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Kumar"
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@cafe.com"
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Temporary Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div>
                <label className="block text-text-secondary font-medium mb-1">Phone Number (Optional)</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-outline flex-1 py-2.5 text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffMutation.isPending}
                  className="btn-primary flex-1 py-2.5 text-xs rounded-xl flex items-center justify-center space-x-1.5"
                >
                  {staffMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Create Staff</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
