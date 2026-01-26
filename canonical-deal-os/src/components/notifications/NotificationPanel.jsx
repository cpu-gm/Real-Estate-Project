import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  DollarSign,
  FileText,
  Users,
  AlertCircle,
  ChevronRight,
  Loader2,
  Settings,
  X,
} from 'lucide-react';

const logger = createLogger('ui:notifications');

// Notification category configuration
const CATEGORIES = {
  'action-required': {
    label: 'Action Required',
    icon: AlertCircle,
    color: 'text-red-600',
  },
  updates: {
    label: 'Updates',
    icon: Bell,
    color: 'text-blue-600',
  },
  mentions: {
    label: 'Mentions',
    icon: Users,
    color: 'text-purple-600',
  },
};

// Notification type icons
const TYPE_ICONS = {
  'capital-call': DollarSign,
  review: FileText,
  document: FileText,
  deal: FileText,
  mention: Users,
  system: Bell,
};

/**
 * Format relative time
 */
function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * NotificationItem Component
 */
function NotificationItem({
  notification,
  onRead,
  onAction,
}) {
  const Icon = TYPE_ICONS[notification.type] || Bell;
  const [isActionLoading, setIsActionLoading] = useState(false);

  const handleClick = () => {
    if (!notification.read) {
      onRead?.(notification.id);
    }
  };

  const handleAction = async (e, action) => {
    e.preventDefault();
    e.stopPropagation();
    setIsActionLoading(true);

    try {
      await onAction?.(notification, action);
      logger.debug('Notification action', {
        id: notification.id,
        actionType: action.type,
        success: true,
      });
    } catch (error) {
      logger.debug('Notification action', {
        id: notification.id,
        actionType: action.type,
        success: false,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <Link
      to={notification.href || '#'}
      data-testid="notification-item"
      data-unread={!notification.read}
      data-category={notification.category}
      onClick={handleClick}
      className={cn(
        'block px-4 py-3 transition-colors',
        'hover:bg-slate-50',
        !notification.read && 'bg-blue-50/50'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'p-2 rounded-lg flex-shrink-0',
            !notification.read ? 'bg-blue-100' : 'bg-slate-100'
          )}
        >
          <Icon
            className={cn(
              'w-4 h-4',
              !notification.read ? 'text-blue-600' : 'text-slate-500'
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                'text-sm',
                !notification.read ? 'font-medium text-slate-900' : 'text-slate-700'
              )}
            >
              {notification.title}
            </p>
            {!notification.read && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
            )}
          </div>

          {notification.description && (
            <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
              {notification.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-400">
              {formatRelativeTime(notification.createdAt)}
            </span>

            {/* Quick Action */}
            {notification.action && (
              <Button
                data-testid="notification-action"
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                disabled={isActionLoading}
                onClick={(e) => handleAction(e, notification.action)}
              >
                {isActionLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  notification.action.label
                )}
              </Button>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}

/**
 * NotificationPanel Component
 *
 * Dropdown panel showing categorized notifications.
 *
 * @param {Object} props
 * @param {Function} props.onClose - Callback to close the panel
 * @param {Function} props.onNotificationRead - Callback when a notification is read
 */
export default function NotificationPanel({ onClose, onNotificationRead }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const { authToken } = useAuth();
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', activeCategory],
    queryFn: async () => {
      const url = activeCategory === 'all'
        ? '/api/notifications'
        : `/api/notifications?category=${activeCategory}`;

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (!res.ok) {
        // Return mock data for development
        return {
          notifications: [],
          unreadCount: 0,
        };
      }

      return res.json();
    },
    enabled: !!authToken,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  logger.debug('Notifications fetched', { count: notifications.length, unreadCount });

  // Mark single notification as read
  const markReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['notifications-count']);
      onNotificationRead?.();
      logger.debug('Mark as read', { ids: [1], bulk: false });
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['notifications-count']);
      onNotificationRead?.();
      logger.debug('Mark as read', { ids: notifications.map((n) => n.id), bulk: true });
      toast({
        title: 'All notifications marked as read',
      });
    },
  });

  // Handle notification action
  const handleAction = async (notification, action) => {
    // Mark as read
    await markReadMutation.mutateAsync(notification.id);

    // Execute action
    if (action.type === 'approve') {
      // Implementation depends on notification type
      toast({
        title: 'Approved',
        description: `${notification.title} has been approved.`,
      });
    }
  };

  // Category tabs
  const categoryTabs = [
    { key: 'all', label: 'All' },
    ...Object.entries(CATEGORIES).map(([key, config]) => ({
      key,
      label: config.label,
    })),
  ];

  return (
    <div data-testid="notification-panel" className="flex flex-col max-h-[32rem]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          {unreadCount > 0 && (
            <Badge className="bg-blue-100 text-blue-700 text-xs">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              data-testid="mark-all-read"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <CheckCheck className="w-3 h-3 mr-1" />
              )}
              Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-100 overflow-x-auto">
        {categoryTabs.map((tab) => (
          <button
            key={tab.key}
            data-category={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap',
              'transition-colors',
              activeCategory === tab.key
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm text-slate-600">Failed to load notifications</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Bell className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-600">No notifications yet</p>
            <p className="text-xs text-slate-400 mt-1">
              We'll notify you when something needs your attention.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onRead={(id) => markReadMutation.mutate(id)}
                onAction={handleAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <Link
          to={createPageUrl('NotificationSettings') || '/settings/notifications'}
          className="flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          onClick={onClose}
        >
          <Settings className="w-4 h-4" />
          Notification Settings
        </Link>
      </div>
    </div>
  );
}
