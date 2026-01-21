import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  FileText,
  DollarSign,
  Users,
  Wrench,
  TrendingUp,
  Calendar,
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIVITY_ICONS = {
  document: FileText,
  financial: DollarSign,
  lease: Users,
  maintenance: Wrench,
  valuation: TrendingUp,
  reminder: Bell,
  milestone: CheckCircle2,
  alert: AlertCircle,
  default: Activity
};

const ACTIVITY_COLORS = {
  document: 'bg-blue-100 text-blue-600',
  financial: 'bg-green-100 text-green-600',
  lease: 'bg-purple-100 text-purple-600',
  maintenance: 'bg-orange-100 text-orange-600',
  valuation: 'bg-emerald-100 text-emerald-600',
  reminder: 'bg-yellow-100 text-yellow-600',
  milestone: 'bg-indigo-100 text-indigo-600',
  alert: 'bg-red-100 text-red-600',
  default: 'bg-slate-100 text-slate-600'
};

function formatRelativeTime(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function ActivityItem({ activity, isLast }) {
  const Icon = ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.default;
  const colorClass = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.default;

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-200" />
      )}

      {/* Icon */}
      <div className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 z-10',
        colorClass
      )}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {activity.title}
            </p>
            {activity.description && (
              <p className="text-sm text-slate-500 mt-0.5">
                {activity.description}
              </p>
            )}
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>

        {/* Metadata badges */}
        {(activity.user || activity.amount || activity.status) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {activity.user && (
              <Badge variant="outline" className="text-xs">
                {activity.user}
              </Badge>
            )}
            {activity.amount && (
              <Badge variant="secondary" className="text-xs">
                {typeof activity.amount === 'number'
                  ? `$${activity.amount.toLocaleString()}`
                  : activity.amount
                }
              </Badge>
            )}
            {activity.status && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  activity.status === 'completed' && 'bg-green-50 text-green-700 border-green-200',
                  activity.status === 'pending' && 'bg-yellow-50 text-yellow-700 border-yellow-200',
                  activity.status === 'overdue' && 'bg-red-50 text-red-700 border-red-200'
                )}
              >
                {activity.status}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function groupActivitiesByDate(activities) {
  const groups = {};

  activities.forEach(activity => {
    const date = new Date(activity.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey;
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      groupKey = formatDate(activity.timestamp);
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(activity);
  });

  return groups;
}

export default function PropertyActivity({
  activities = [],
  showDateGroups = true,
  maxItems,
  onViewAll
}) {
  // Sort by timestamp descending
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  // Limit items if specified
  const displayActivities = maxItems
    ? sortedActivities.slice(0, maxItems)
    : sortedActivities;

  const hasMore = maxItems && sortedActivities.length > maxItems;

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-500" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No recent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showDateGroups) {
    const groupedActivities = groupActivitiesByDate(displayActivities);

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-500" />
            Recent Activity
          </CardTitle>
          {hasMore && onViewAll && (
            <button
              onClick={onViewAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </button>
          )}
        </CardHeader>
        <CardContent>
          {Object.entries(groupedActivities).map(([date, items], groupIndex) => (
            <div key={date} className={groupIndex > 0 ? 'mt-6' : ''}>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                {date}
              </h4>
              {items.map((activity, index) => (
                <ActivityItem
                  key={activity.id || index}
                  activity={activity}
                  isLast={index === items.length - 1 && groupIndex === Object.keys(groupedActivities).length - 1}
                />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-500" />
          Recent Activity
        </CardTitle>
        {hasMore && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View all
          </button>
        )}
      </CardHeader>
      <CardContent>
        {displayActivities.map((activity, index) => (
          <ActivityItem
            key={activity.id || index}
            activity={activity}
            isLast={index === displayActivities.length - 1}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// Export for custom use
export { ActivityItem, ACTIVITY_ICONS, ACTIVITY_COLORS };
