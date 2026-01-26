import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import { createPageUrl } from '@/utils';
import UrgencyBadge, { calculateUrgencyLevel, getDaysUntilDue } from '@/components/UrgencyBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Send,
  FileCheck,
  Users,
  DollarSign,
  Keyboard,
  X,
} from 'lucide-react';

const logger = createLogger('ui:command-center');

// Urgency priority order (highest to lowest)
const URGENCY_PRIORITY = {
  blocked: 0,
  urgent: 1,
  warning: 2,
  attention: 3,
  ready: 4,
  normal: 5,
};

// Style configuration for each urgency level
const URGENCY_STYLES = {
  blocked: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    label: 'Blocked',
  },
  urgent: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    label: 'Urgent',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: AlertCircle,
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Attention',
  },
  attention: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: AlertCircle,
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Attention',
  },
  ready: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
    label: 'Ready',
  },
  normal: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: Clock,
    iconColor: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-700',
    label: 'Normal',
  },
};

// Item type configuration
const ITEM_TYPES = {
  deal: { icon: FileCheck, color: 'text-blue-600' },
  review: { icon: Users, color: 'text-purple-600' },
  'capital-call': { icon: DollarSign, color: 'text-green-600' },
  document: { icon: FileCheck, color: 'text-indigo-600' },
  default: { icon: Clock, color: 'text-slate-600' },
};

/**
 * Sort items by urgency (blocked first, then urgent, warning, ready)
 */
function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const priorityA = URGENCY_PRIORITY[a.urgency] ?? URGENCY_PRIORITY.normal;
    const priorityB = URGENCY_PRIORITY[b.urgency] ?? URGENCY_PRIORITY.normal;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Secondary sort by due date (earlier first)
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }

    return 0;
  });
}

/**
 * Group items by urgency level
 */
function groupByUrgency(items) {
  const groups = {
    blocked: [],
    urgent: [],
    warning: [],
    attention: [],
    ready: [],
    normal: [],
  };

  items.forEach((item) => {
    const urgency = item.urgency || 'normal';
    if (groups[urgency]) {
      groups[urgency].push(item);
    } else {
      groups.normal.push(item);
    }
  });

  return groups;
}

/**
 * Count items by urgency level
 */
function countByUrgency(items) {
  const counts = {
    blocked: 0,
    urgent: 0,
    warning: 0,
    attention: 0,
    ready: 0,
    normal: 0,
  };

  items.forEach((item) => {
    const urgency = item.urgency || 'normal';
    counts[urgency] = (counts[urgency] || 0) + 1;
  });

  return counts;
}

/**
 * AttentionItem Component - Single item in the attention feed
 */
function AttentionItem({
  item,
  isSelected,
  onSelect,
  onAction,
  itemRef,
}) {
  const styles = URGENCY_STYLES[item.urgency] || URGENCY_STYLES.normal;
  const StatusIcon = styles.icon;
  const typeConfig = ITEM_TYPES[item.type] || ITEM_TYPES.default;
  const TypeIcon = typeConfig.icon;

  return (
    <div
      ref={itemRef}
      data-testid="attention-item"
      data-urgency={item.urgency}
      data-selected={isSelected}
      data-item-id={item.id}
      onClick={() => onSelect?.(item)}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border cursor-pointer',
        'transition-all duration-200',
        styles.bg,
        styles.border,
        isSelected && 'ring-2 ring-blue-500 ring-offset-2',
        'hover:shadow-md'
      )}
    >
      {/* Status Icon */}
      <StatusIcon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', styles.iconColor)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <TypeIcon className={cn('w-4 h-4', typeConfig.color)} />
          <h3 className="font-semibold text-slate-900 truncate">{item.title}</h3>
          <Badge className={cn('text-xs', styles.badge)}>
            {styles.label}
          </Badge>
        </div>

        <p className="text-sm text-slate-600 mb-2 line-clamp-2">{item.summary}</p>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {item.dueDate && (
            <UrgencyBadge dueDate={item.dueDate} size="sm" showIcon={false} />
          )}
          {item.assignee && <span>Assigned to {item.assignee}</span>}
        </div>

        {/* Actions */}
        {item.actions && item.actions.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            {item.actions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant={i === 0 ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(item, action);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Navigate indicator */}
      <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
    </div>
  );
}

/**
 * ShortcutHelp Component - Keyboard shortcut overlay
 */
function ShortcutHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'j', description: 'Move down to next item' },
    { key: 'k', description: 'Move up to previous item' },
    { key: 'Enter', description: 'Open selected item' },
    { key: 'a', description: 'Quick approve/assign' },
    { key: 'd', description: 'Dismiss/defer item' },
    { key: '?', description: 'Show/hide this help' },
    { key: 'Esc', description: 'Close help overlay' },
  ];

  return (
    <div
      data-testid="shortcut-help"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-md"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.key} className="flex items-center gap-3">
              <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-sm font-mono min-w-[2.5rem] text-center">
                {shortcut.key}
              </kbd>
              <span className="text-sm text-slate-600">{shortcut.description}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
          Press <kbd className="px-1 bg-slate-100 rounded text-xs">?</kbd> anytime to toggle this help.
        </p>
      </div>
    </div>
  );
}

/**
 * UrgencyBadgeCounts Component - Shows counts for each urgency level
 */
function UrgencyBadgeCounts({ counts }) {
  const badges = [
    { key: 'blocked', label: 'Blocked', color: 'bg-red-100 text-red-700' },
    { key: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
    { key: 'warning', label: 'Attention', color: 'bg-amber-100 text-amber-700' },
    { key: 'ready', label: 'Ready', color: 'bg-green-100 text-green-700' },
  ];

  return (
    <div className="flex items-center gap-2">
      {badges.map(({ key, label, color }) => {
        const count = (counts[key] || 0) + (key === 'warning' ? (counts.attention || 0) : 0);
        if (count === 0) return null;

        return (
          <Badge
            key={key}
            data-testid={`badge-${key}`}
            className={cn('text-xs', color)}
          >
            {count} {label}
          </Badge>
        );
      })}
    </div>
  );
}

/**
 * CommandCenter Component
 *
 * Main dashboard component with urgency-sorted attention feed and keyboard navigation.
 *
 * @param {Object} props
 * @param {Array} props.items - Array of attention items to display
 * @param {Function} props.onItemAction - Callback when action is performed on item
 * @param {Function} props.onItemSelect - Callback when item is selected
 * @param {string} props.title - Widget title
 * @param {string} props.className - Additional CSS classes
 */
export default function CommandCenter({
  items = [],
  onItemAction,
  onItemSelect,
  title = 'Attention Required',
  className,
}) {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const containerRef = useRef(null);
  const itemRefs = useRef([]);

  // Sort items by urgency
  const sortedItems = sortByUrgency(items);
  const counts = countByUrgency(items);

  logger.time('feedRender');
  logger.debug('Feed sorted', {
    itemCount: items.length,
    urgentCount: counts.urgent + counts.blocked,
    warningCount: counts.warning + counts.attention,
  });

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event) => {
      // Don't handle if user is typing in an input
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA' ||
        event.target.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      logger.debug('Keyboard nav', { key, selectedIndex });

      switch (key) {
        case 'j':
          // Move down
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev < sortedItems.length - 1 ? prev + 1 : prev
          );
          break;

        case 'k':
          // Move up
          event.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;

        case 'enter':
          // Open selected item
          if (selectedIndex >= 0 && sortedItems[selectedIndex]) {
            event.preventDefault();
            const item = sortedItems[selectedIndex];
            if (item.href) {
              navigate(item.href);
            } else if (item.dealId) {
              navigate(createPageUrl(`DealOverview?id=${item.dealId}`));
            }
            logger.debug('Keyboard nav', { key, selectedIndex, action: 'open' });
          }
          break;

        case 'a':
          // Quick action (approve/assign)
          if (selectedIndex >= 0 && sortedItems[selectedIndex]) {
            event.preventDefault();
            const item = sortedItems[selectedIndex];
            const primaryAction = item.actions?.[0];
            if (primaryAction) {
              onItemAction?.(item, primaryAction);
              logger.debug('Quick action', {
                actionType: primaryAction.type,
                itemId: item.id,
              });
            }
          }
          break;

        case 'd':
          // Dismiss/defer
          if (selectedIndex >= 0 && sortedItems[selectedIndex]) {
            event.preventDefault();
            const item = sortedItems[selectedIndex];
            onItemAction?.(item, { type: 'dismiss', label: 'Dismiss' });
            logger.debug('Quick action', {
              actionType: 'dismiss',
              itemId: item.id,
            });
          }
          break;

        case '?':
          // Show/hide help
          event.preventDefault();
          setShowHelp((prev) => !prev);
          break;

        case 'escape':
          // Close help
          if (showHelp) {
            event.preventDefault();
            setShowHelp(false);
          }
          break;
      }
    },
    [selectedIndex, sortedItems, navigate, onItemAction, showHelp]
  );

  // Register keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Log render time
  useEffect(() => {
    logger.timeEnd('feedRender');
  }, []);

  if (sortedItems.length === 0) {
    return (
      <>
        <div
          data-testid="command-center"
          className={cn(
            'bg-white rounded-xl border border-slate-200 p-6',
            className
          )}
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">All Clear!</h3>
            <p className="text-sm text-slate-500">
              No items need your attention right now.
            </p>
          </div>
        </div>
        {/* Shortcut Help Overlay - always available */}
        <ShortcutHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
      </>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        data-testid="command-center"
        className={cn('space-y-4', className)}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {title}
            </h2>
            <UrgencyBadgeCounts counts={counts} />
          </div>
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Shortcuts</span>
          </button>
        </div>

        {/* Attention Feed */}
        <div className="space-y-3">
          {sortedItems.map((item, index) => (
            <AttentionItem
              key={item.id}
              item={item}
              isSelected={selectedIndex === index}
              onSelect={() => {
                setSelectedIndex(index);
                onItemSelect?.(item);
              }}
              onAction={onItemAction}
              itemRef={(el) => (itemRefs.current[index] = el)}
            />
          ))}
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-center text-slate-400">
          Press <kbd className="px-1 bg-slate-100 rounded">j</kbd>/
          <kbd className="px-1 bg-slate-100 rounded">k</kbd> to navigate,{' '}
          <kbd className="px-1 bg-slate-100 rounded">Enter</kbd> to open,{' '}
          <kbd className="px-1 bg-slate-100 rounded">?</kbd> for help
        </p>
      </div>

      {/* Shortcut Help Overlay */}
      <ShortcutHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}

// Export utilities for use elsewhere
export { sortByUrgency, groupByUrgency, countByUrgency, URGENCY_STYLES, URGENCY_PRIORITY };
