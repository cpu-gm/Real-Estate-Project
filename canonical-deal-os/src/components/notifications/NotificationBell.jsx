import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import { useAuth } from '@/lib/AuthContext';
import { Bell } from 'lucide-react';
import NotificationPanel from './NotificationPanel';

const logger = createLogger('ui:notifications');

/**
 * NotificationBell Component
 *
 * Bell icon with unread count badge that opens a notification panel dropdown.
 *
 * @param {Object} props
 * @param {string} props.className - Additional CSS classes
 */
export default function NotificationBell({ className }) {
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const { authToken } = useAuth();
  const queryClient = useQueryClient();

  // Fetch notification count
  const { data: notificationData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/count', {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) {
        // Return default if endpoint doesn't exist yet
        return { unreadCount: 0 };
      }
      return res.json();
    },
    enabled: !!authToken,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unreadCount = notificationData?.unreadCount || 0;

  logger.debug('Notifications fetched', { count: unreadCount, unreadCount });

  // Handle click outside to close panel
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        bellRef.current &&
        !bellRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard shortcut: 'n' to toggle panel
  const handleKeyDown = useCallback((event) => {
    // Don't handle if user is typing in an input
    if (
      event.target.tagName === 'INPUT' ||
      event.target.tagName === 'TEXTAREA' ||
      event.target.isContentEditable
    ) {
      return;
    }

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      setIsOpen((prev) => !prev);
      logger.debug('Panel toggle', { isOpen: !isOpen, trigger: 'keyboard' });
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Toggle panel
  const togglePanel = () => {
    setIsOpen((prev) => !prev);
    logger.debug('Panel toggle', { isOpen: !isOpen, trigger: 'click' });
  };

  // Handle notification read
  const handleNotificationRead = () => {
    // Invalidate count query to refresh
    queryClient.invalidateQueries(['notifications-count']);
  };

  return (
    <div className={cn('relative', className)}>
      {/* Bell Button */}
      <button
        ref={bellRef}
        data-testid="notification-bell"
        onClick={togglePanel}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          isOpen && 'bg-slate-100 text-slate-900'
        )}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className={cn(
              'absolute -top-1 -right-1',
              'flex items-center justify-center',
              'min-w-[1.25rem] h-5 px-1',
              'text-xs font-bold text-white',
              'bg-red-500 rounded-full',
              'animate-pulse'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-full mt-2 z-50',
            'w-96 max-h-[32rem]',
            'bg-white rounded-xl shadow-xl border border-slate-200',
            'overflow-hidden'
          )}
        >
          <NotificationPanel
            onClose={() => setIsOpen(false)}
            onNotificationRead={handleNotificationRead}
          />
        </div>
      )}
    </div>
  );
}
