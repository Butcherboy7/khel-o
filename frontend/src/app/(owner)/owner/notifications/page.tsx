'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Ticket, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { Badge, ErrorState, Skeleton } from '@/components/ui';
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-h2 font-bold text-text-primary">Notifications</h1>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary transition-colors p-2 rounded-full hover:bg-surface"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || unreadCount === 0}
              className="flex items-center gap-1 text-caption font-medium text-primary hover:text-primary/80 transition-colors px-3 py-2 rounded-full hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCheck className="h-4 w-4" />
              <span>Mark all read</span>
            </button>
          </div>
        )}
      </div>

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
              className={`p-4 rounded-2xl transition-all cursor-pointer ${
                n.isRead
                  ? 'bg-card border border-border/60 hover:border-border'
                  : 'bg-surface border-l-4 border-l-primary border border-border/80'
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
