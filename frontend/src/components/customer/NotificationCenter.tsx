'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Trash2, X, Ticket, Sparkles, AlertCircle } from 'lucide-react';
import { Button, Badge } from '@/components/ui';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'booking' | 'offer' | 'system';
  isRead: boolean;
  link?: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
}

export function NotificationCenter({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onMarkAsRead,
  onClearAll,
}: NotificationCenterProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: NotificationItem) => {
    onMarkAsRead(n.id);
    if (n.link) {
      router.push(n.link);
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-modal flex items-start justify-end p-4 md:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in"
    >
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border/80 shadow-overlay overflow-hidden flex flex-col max-h-[85vh] mt-12 md:mt-14">
        {/* Header */}
        <div className="p-4 border-b border-border/60 flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-h3 text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="primary" size="sm">
                {unreadCount} new
              </Badge>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Close notifications"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-border/60 hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-b border-border/40 flex items-center justify-between bg-card text-caption text-text-secondary">
            <button
              onClick={onMarkAllAsRead}
              className="flex items-center gap-1 hover:text-primary transition-colors font-medium"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </button>

            <button
              onClick={onClearAll}
              className="flex items-center gap-1 hover:text-error transition-colors font-medium"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear all</span>
            </button>
          </div>
        )}

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-2">
          {notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4 text-text-secondary">
              <Bell className="h-8 w-8 mb-2 opacity-40 text-primary" />
              <p className="text-body font-medium text-text-primary">All caught up!</p>
              <p className="text-caption mt-0.5">No new notifications at this time.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-3 rounded-2xl flex items-start gap-3 transition-colors cursor-pointer ${
                  n.isRead ? 'opacity-80 bg-card hover:bg-surface/50' : 'bg-surface border-l-4 border-primary'
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 mt-0.5 ${
                    n.type === 'booking'
                      ? 'bg-primary/10 text-primary'
                      : n.type === 'offer'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-secondary/10 text-secondary'
                  }`}
                >
                  {n.type === 'booking' ? (
                    <Ticket className="h-4 w-4" />
                  ) : n.type === 'offer' ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-heading text-h4 text-text-primary truncate">
                      {n.title}
                    </h4>
                    <span className="text-caption text-text-secondary/70 flex-shrink-0">
                      {n.timestamp}
                    </span>
                  </div>
                  <p className="text-caption text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                    {n.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
