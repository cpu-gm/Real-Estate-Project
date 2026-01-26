import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import { createPageUrl } from '@/utils';
import UrgencyBadge, { calculateUrgencyLevel, getDaysUntilDue } from '@/components/UrgencyBadge';
import { useAuth } from '@/lib/AuthContext';
import {
  Calendar,
  DollarSign,
  FileText,
  Users,
  ChevronRight,
  Clock,
  AlertTriangle,
} from 'lucide-react';

const logger = createLogger('ui:urgency');

// Deadline type configuration
const DEADLINE_TYPES = {
  'capital-call': {
    label: 'Capital Calls',
    icon: DollarSign,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  'review': {
    label: 'Reviews',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  'document': {
    label: 'Documents',
    icon: FileText,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  'deal': {
    label: 'Deals',
    icon: Calendar,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  'buyer-response': {
    label: 'Buyer Responses',
    icon: Users,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
};

/**
 * Group deadlines by type
 */
function groupDeadlinesByType(deadlines) {
  const groups = {};

  deadlines.forEach((deadline) => {
    const type = deadline.type || 'deal';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(deadline);
  });

  // Sort items within each group by urgency
  Object.keys(groups).forEach((type) => {
    groups[type].sort((a, b) => {
      const daysA = getDaysUntilDue(a.dueDate);
      const daysB = getDaysUntilDue(b.dueDate);
      return daysA - daysB;
    });
  });

  return groups;
}

/**
 * Filter deadlines to next 7 days
 */
function filterUpcoming(deadlines, days = 7) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return deadlines.filter((deadline) => {
    const dueDate = new Date(deadline.dueDate);
    return dueDate <= cutoff;
  });
}

/**
 * DeadlineItem Component
 */
function DeadlineItem({ deadline }) {
  const config = DEADLINE_TYPES[deadline.type] || DEADLINE_TYPES.deal;
  const Icon = config.icon;

  return (
    <Link
      to={deadline.href || '#'}
      data-testid="deadline-item"
      data-type={deadline.type}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors',
        'group cursor-pointer'
      )}
    >
      <div className={cn('p-1.5 rounded-md', config.bgColor)}>
        <Icon className={cn('w-3.5 h-3.5', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">
          {deadline.title}
        </p>
        {deadline.subtitle && (
          <p className="text-xs text-slate-500 truncate">{deadline.subtitle}</p>
        )}
      </div>
      <UrgencyBadge dueDate={deadline.dueDate} size="sm" showIcon={false} />
      <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

/**
 * DeadlineGroup Component
 */
function DeadlineGroup({ type, deadlines, defaultExpanded = true }) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const config = DEADLINE_TYPES[type] || DEADLINE_TYPES.deal;
  const Icon = config.icon;

  const overdueCount = deadlines.filter(
    (d) => calculateUrgencyLevel(d.dueDate) === 'overdue'
  ).length;

  return (
    <div data-type={type} className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-slate-50 rounded-md"
      >
        <Icon className={cn('w-4 h-4', config.color)} />
        <span className="text-sm font-medium text-slate-700 flex-1">
          {config.label}
        </span>
        <span className="text-xs text-slate-500">
          {deadlines.length}
        </span>
        {overdueCount > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
            {overdueCount} overdue
          </span>
        )}
        <ChevronRight
          className={cn(
            'w-4 h-4 text-slate-400 transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-0.5 pl-2">
          {deadlines.map((deadline, index) => (
            <DeadlineItem key={deadline.id || index} deadline={deadline} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DeadlineWidget Component
 *
 * Displays upcoming deadlines grouped by type for the next 7 days.
 *
 * @param {Object} props
 * @param {Array} props.deadlines - Array of deadline objects (optional, will fetch if not provided)
 * @param {number} props.daysAhead - Number of days to show (default: 7)
 * @param {string} props.title - Widget title (default: "Upcoming Deadlines")
 * @param {boolean} props.compact - Compact view mode
 * @param {string} props.className - Additional CSS classes
 */
export default function DeadlineWidget({
  deadlines: propDeadlines,
  daysAhead = 7,
  title = 'Upcoming Deadlines',
  compact = false,
  className,
}) {
  const { authToken } = useAuth();

  // Fetch deadlines if not provided as prop
  const { data: fetchedDeadlines = [] } = useQuery({
    queryKey: ['deadlines', daysAhead],
    queryFn: async () => {
      const res = await fetch(`/api/deadlines?days=${daysAhead}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.deadlines || [];
    },
    enabled: !propDeadlines && !!authToken,
    refetchInterval: 60000, // Refresh every minute
  });

  const deadlines = propDeadlines || fetchedDeadlines;
  const upcomingDeadlines = filterUpcoming(deadlines, daysAhead);
  const groupedDeadlines = groupDeadlinesByType(upcomingDeadlines);

  const totalCount = upcomingDeadlines.length;
  const overdueCount = upcomingDeadlines.filter(
    (d) => calculateUrgencyLevel(d.dueDate) === 'overdue'
  ).length;

  logger.debug('Deadline widget', { upcomingCount: totalCount, overdueCount });

  if (totalCount === 0) {
    return (
      <div
        data-testid="deadline-widget"
        className={cn(
          'bg-white rounded-xl border border-slate-200 p-4',
          className
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Clock className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">
            No upcoming deadlines in the next {daysAhead} days
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="deadline-widget"
      className={cn(
        'bg-white rounded-xl border border-slate-200',
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {overdueCount} overdue
            </span>
          )}
          <span className="text-xs text-slate-500">
            {totalCount} total
          </span>
        </div>
      </div>

      {/* Deadline Groups */}
      <div className="space-y-3">
        {Object.entries(groupedDeadlines).map(([type, items]) => (
          <DeadlineGroup
            key={type}
            type={type}
            deadlines={items}
            defaultExpanded={!compact || items.some(
              (d) => calculateUrgencyLevel(d.dueDate) === 'overdue'
            )}
          />
        ))}
      </div>

      {/* View All Link */}
      {!compact && totalCount > 5 && (
        <Link
          to={createPageUrl('Deadlines')}
          className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-slate-100 text-sm text-blue-600 hover:text-blue-700"
        >
          View all deadlines
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

/**
 * MiniDeadlineWidget Component
 *
 * Minimal version showing just counts and most urgent item.
 */
export function MiniDeadlineWidget({ deadlines = [], className }) {
  const upcomingDeadlines = filterUpcoming(deadlines, 7);
  const overdueCount = upcomingDeadlines.filter(
    (d) => calculateUrgencyLevel(d.dueDate) === 'overdue'
  ).length;

  const mostUrgent = upcomingDeadlines.sort((a, b) => {
    const daysA = getDaysUntilDue(a.dueDate);
    const daysB = getDaysUntilDue(b.dueDate);
    return daysA - daysB;
  })[0];

  if (upcomingDeadlines.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-slate-500', className)}>
        <Clock className="w-4 h-4" />
        <span>No upcoming deadlines</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {overdueCount > 0 ? (
        <span className="flex items-center gap-1.5 px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
          <AlertTriangle className="w-3.5 h-3.5" />
          {overdueCount} overdue
        </span>
      ) : mostUrgent ? (
        <span className="flex items-center gap-1.5 text-sm text-slate-600">
          <Clock className="w-4 h-4 text-slate-400" />
          Next: {mostUrgent.title}
          <UrgencyBadge dueDate={mostUrgent.dueDate} size="sm" showIcon={false} />
        </span>
      ) : null}
    </div>
  );
}
