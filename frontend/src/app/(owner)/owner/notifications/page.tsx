'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Ticket, Sparkles, AlertCircle, RefreshCw, X, Trash2 } from 'lucide-react';
import { Badge, Button, ErrorState, Skeleton } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { apiClient } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  notificationType: 'booking_confirmed' | 'booking_reminder' | 'booking_cancelled' | 'payment_success' | 'payment_failed' | 'promotion' | 'system';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

export default function OwnerNotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/notifications');
      return response.data;
    },
    staleTime: 5_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/api/v1/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.post(`/api/v1/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.delete(`/api/v1/notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete('/api/v1/notifications/clear-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const handleNotificationClick = (n: NotificationItem) => {
    markAsReadMutation.mutate(n.id);
    if (n.link) {
      router.push(n.link);
    }
  };

  const notifications = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="flex flex-col gap-6">
      <OwnerPageHeader
        title="Alerts"
        description="New bookings, cancellations and payment problems land here."
        action={
          notifications.length > 0 ? (
            // Buttons, not bare text links: at 390px these three tap areas sat
            // in a single unpadded row and were easy to hit by accident —
            // "Clear all" among them.
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending || unreadCount === 0}
                className="gap-1.5"
              >
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                <span>Mark all read</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                aria-label="Refresh alerts"
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Refresh</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
                className="gap-1.5 text-error hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Clear all</span>
              </Button>
            </div>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-card border border-border/60">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          title="Unable to load notifications"
          message={error?.message || 'Failed to fetch notifications. Please check your connection.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="h-16 w-16 mb-4 opacity-30 text-primary" />
          <h2 className="font-heading text-h3 font-bold text-text-primary mb-2">All caught up!</h2>
          <p className="text-body text-text-secondary">
            New bookings, cancellations, check-ins, and payment issues will show up here.
          </p>
        </div>
      )}

      {!isLoading && !isError && notifications.length > 0 && (
        <div className="space-y-2">
          {unreadCount > 0 && (
            <Badge variant="primary" size="md">
              {unreadCount} unread
            </Badge>
          )}

          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              // Unread is carried by a filled surface and the dot beside the
              // title, not by a thick coloured strip down the left edge — that
              // strip fought the card's own rounded corner and read as damage.
              className={`cursor-pointer rounded-2xl p-4 transition-all ${
                n.isRead
                  ? 'border border-border/60 bg-card hover:border-border'
                  : 'border border-primary/40 bg-primary/[0.04] hover:border-primary/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                    n.notificationType.includes('booking')
                      ? 'bg-primary/10 text-primary'
                      : n.notificationType === 'promotion'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-secondary/10 text-secondary'
                  }`}
                >
                  {n.notificationType.includes('booking') ? (
                    <Ticket className="h-4 w-4" />
                  ) : n.notificationType === 'promotion' ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-heading text-body font-semibold text-text-primary">{n.title}</h3>
                    {!n.isRead && <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-caption text-text-secondary mb-1 leading-relaxed">{n.message}</p>
                  <span className="text-overline text-text-secondary/70">
                    {new Date(n.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotificationMutation.mutate(n.id);
                  }}
                  title="Dismiss"
                  aria-label="Dismiss notification"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface hover:text-red-600 transition-colors flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
