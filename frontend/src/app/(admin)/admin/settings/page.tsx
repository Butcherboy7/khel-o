'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getPlatformSettings, updatePlatformSettings } from '@/lib/api/admin';
import { Card, CardContent, Button, SkeletonCard, ErrorState } from '@/components/ui';

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: getPlatformSettings,
    staleTime: 30_000,
  });

  const [commission, setCommission] = useState('10');
  const [supportEmail, setSupportEmail] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setCommission(String(data.settings.commissionPercentage));
      setSupportEmail(data.settings.supportEmail);
      setMaintenanceMode(data.settings.maintenanceMode);
      setMaintenanceMessage(data.settings.maintenanceMessage ?? '');
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => updatePlatformSettings({
      commissionPercentage: Number(commission),
      supportEmail,
      maintenanceMode,
      maintenanceMessage: maintenanceMessage || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'platform-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 max-w-xl">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load settings"
        message={(error as Error)?.message ?? 'Could not retrieve platform settings.'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12 max-w-xl">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Platform Settings</h1>
        </div>
        <p className="text-caption text-text-secondary">
          Global configuration for the KHELO platform. Changes here affect every café and user.
        </p>
      </div>

      <Card elevation="resting">
        <CardContent className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-caption font-semibold text-text-primary mb-1.5 block">Platform commission (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-text-tertiary mt-1">Reference value only — not yet wired into a live payout calculation.</p>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-primary mb-1.5 block">Support email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </CardContent>
      </Card>

      <Card elevation="resting">
        <CardContent className="p-5 flex flex-col gap-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-caption font-semibold text-text-primary flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                Maintenance mode
              </p>
              <p className="text-[11px] text-text-tertiary mt-0.5">Flag only for now — not yet enforced platform-wide.</p>
            </div>
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>

          {maintenanceMode && (
            <div>
              <label className="text-caption font-semibold text-text-primary mb-1.5 block">Maintenance message</label>
              <textarea
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={2}
                placeholder="We'll be back shortly — thanks for your patience."
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-caption text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="gap-2 self-start"
        >
          <Save className="h-4 w-4" />
          Save settings
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-caption text-success">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
