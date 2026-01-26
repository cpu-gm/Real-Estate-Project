import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import { createPageUrl } from '@/utils';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';

const logger = createLogger('ui:urgency');

/**
 * OverdueBanner Component
 *
 * Prominent alert banner displayed at the top of pages when there are overdue items.
 *
 * @param {Object} props
 * @param {Array} props.overdueItems - Array of overdue item objects
 * @param {boolean} props.dismissible - Allow dismissing the banner (default: true)
 * @param {string} props.dismissKey - localStorage key for dismiss state
 * @param {Function} props.onDismiss - Callback when dismissed
 * @param {string} props.className - Additional CSS classes
 */
export default function OverdueBanner({
  overdueItems = [],
  dismissible = true,
  dismissKey = 'overdue-banner-dismissed',
  onDismiss,
  className,
}) {
  const [dismissed, setDismissed] = useState(false);
  const dismissButtonRef = useRef(null);

  // Check localStorage for dismiss state on mount
  useEffect(() => {
    if (dismissKey) {
      const dismissedData = localStorage.getItem(dismissKey);
      if (dismissedData) {
        try {
          const { timestamp, count } = JSON.parse(dismissedData);
          // Re-show banner if:
          // 1. More than 24 hours since dismissed
          // 2. New overdue items appeared
          const hoursSinceDismiss = (Date.now() - timestamp) / (1000 * 60 * 60);
          if (hoursSinceDismiss < 24 && count >= overdueItems.length) {
            setDismissed(true);
          }
        } catch (e) {
          localStorage.removeItem(dismissKey);
        }
      }
    }
  }, [dismissKey, overdueItems.length]);

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      localStorage.setItem(
        dismissKey,
        JSON.stringify({ timestamp: Date.now(), count: overdueItems.length })
      );
    }
    onDismiss?.();
    logger.debug('Banner dismissed', { itemCount: overdueItems.length });
  };

  // Don't render if no overdue items or dismissed
  if (overdueItems.length === 0 || dismissed) {
    return null;
  }

  const hasOverdue = overdueItems.length > 0;
  logger.debug('Banner visibility', { hasOverdue, itemCount: overdueItems.length });

  // Get summary of overdue items by type
  const byType = overdueItems.reduce((acc, item) => {
    const type = item.type || 'item';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const summaryParts = Object.entries(byType).map(([type, count]) => {
    const label = count === 1 ? type : `${type}s`;
    return `${count} ${label}`;
  });

  const summary = summaryParts.join(', ');

  return (
    <div
      data-testid="overdue-banner"
      role="alert"
      aria-live="polite"
      className={cn(
        'bg-red-50 border-b border-red-200',
        'px-4 py-3',
        className
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">
            <span className="font-semibold">
              {overdueItems.length} overdue{' '}
              {overdueItems.length === 1 ? 'item' : 'items'}
            </span>
            {' '}need{overdueItems.length === 1 ? 's' : ''} your attention
            {summary && (
              <span className="text-red-600 font-normal"> ({summary})</span>
            )}
          </p>
        </div>

        {/* Action */}
        <div className="flex items-center gap-2">
          <Link
            to={createPageUrl('Home') + '?filter=overdue'}
            className={cn(
              'inline-flex items-center gap-1',
              'px-3 py-1.5 rounded-md',
              'text-sm font-medium',
              'bg-red-600 text-white',
              'hover:bg-red-700',
              'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
              'transition-colors'
            )}
          >
            Review now
            <ChevronRight className="w-4 h-4" />
          </Link>

          {/* Dismiss button */}
          {dismissible && (
            <button
              ref={dismissButtonRef}
              type="button"
              onClick={handleDismiss}
              className={cn(
                'p-1.5 rounded-md',
                'text-red-500 hover:text-red-700',
                'hover:bg-red-100',
                'focus:outline-none focus:ring-2 focus:ring-red-500',
                'transition-colors cursor-pointer'
              )}
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CompactOverdueBanner Component
 *
 * Smaller banner for use in sidebars or cards.
 */
export function CompactOverdueBanner({
  overdueItems = [],
  href,
  className,
}) {
  if (overdueItems.length === 0) {
    return null;
  }

  return (
    <Link
      to={href || createPageUrl('Home') + '?filter=overdue'}
      data-testid="overdue-banner-compact"
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg',
        'bg-red-50 border border-red-200',
        'text-red-700 hover:bg-red-100',
        'transition-colors',
        className
      )}
    >
      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
      <span className="text-sm font-medium flex-1">
        {overdueItems.length} overdue
      </span>
      <ChevronRight className="w-4 h-4 text-red-400" />
    </Link>
  );
}

/**
 * useOverdueItems Hook
 *
 * Hook to track overdue items from various sources.
 */
export function useOverdueItems(sources = {}) {
  const [overdueItems, setOverdueItems] = useState([]);

  useEffect(() => {
    const items = [];

    // Check capital calls
    if (sources.capitalCalls) {
      sources.capitalCalls.forEach((call) => {
        if (call.dueDate && new Date(call.dueDate) < new Date()) {
          items.push({
            id: call.id,
            type: 'capital call',
            title: call.name || 'Capital Call',
            dueDate: call.dueDate,
            href: createPageUrl('CapitalCalls') + `?id=${call.id}`,
          });
        }
      });
    }

    // Check reviews
    if (sources.reviews) {
      sources.reviews.forEach((review) => {
        if (review.dueDate && new Date(review.dueDate) < new Date()) {
          items.push({
            id: review.id,
            type: 'review',
            title: review.dealName || 'Review Request',
            dueDate: review.dueDate,
            href: createPageUrl('DealOverview') + `?id=${review.dealId}`,
          });
        }
      });
    }

    // Check documents
    if (sources.documents) {
      sources.documents.forEach((doc) => {
        if (doc.dueDate && new Date(doc.dueDate) < new Date()) {
          items.push({
            id: doc.id,
            type: 'document',
            title: doc.name || 'Document',
            dueDate: doc.dueDate,
            href: doc.href || '#',
          });
        }
      });
    }

    setOverdueItems(items);
    logger.debug('Overdue items updated', { count: items.length });
  }, [sources.capitalCalls, sources.reviews, sources.documents]);

  return overdueItems;
}
