import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  useChecklistStatus,
  useChecklistItems,
  useSuggestions,
  useRisks,
  usePendingApprovals,
} from '@/api/dd';
import { DDProgressCircle } from './DDProgressBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  Sparkles,
  Loader2,
  ListChecks,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

/**
 * DDOverviewCard - Comprehensive mini-dashboard for Due Diligence
 *
 * Shows:
 * - Overall completion percentage with circular progress
 * - Per-category progress bars
 * - Alert badges (overdue, blocked, needs review)
 * - Next 3 recommended actions
 * - Recent activity feed
 * - "View All" button to full page
 */
export function DDOverviewCard({ dealId }) {
  // Fetch all DD data
  const { data: statusData, isLoading: statusLoading, error: statusError } = useChecklistStatus(dealId);
  const { data: itemsData, isLoading: itemsLoading } = useChecklistItems(dealId, {});
  const { data: suggestionsData } = useSuggestions(dealId, 3);
  const { data: risksData } = useRisks(dealId);
  const { data: approvalsData } = usePendingApprovals(dealId);

  const isLoading = statusLoading || itemsLoading;

  // If no checklist exists, show initialization prompt
  if (!isLoading && statusError?.status === 404) {
    return (
      <DDInitializePrompt dealId={dealId} />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const status = statusData || {};
  const items = itemsData?.items || [];
  const categories = itemsData?.categories || [];
  const suggestions = suggestionsData?.suggestions || [];
  const risks = risksData?.risks || [];
  const pendingApprovals = approvalsData?.approvals || [];

  // Calculate alerts
  const now = new Date();
  const overdueCount = items.filter(i =>
    i.dueDate && new Date(i.dueDate) < now && i.status !== 'COMPLETE' && i.status !== 'N/A'
  ).length;
  const blockedCount = items.filter(i => i.status === 'BLOCKED').length;
  const needsReviewCount = pendingApprovals.length;

  // Get recent activity (last 5 status changes)
  const recentActivity = items
    .filter(i => i.updatedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  // Calculate category stats
  const categoryStats = categories.map(cat => {
    const catItems = items.filter(i => i.categoryCode === cat.code);
    const completed = catItems.filter(i => i.status === 'COMPLETE').length;
    const total = catItems.length;
    return {
      ...cat,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }).filter(c => c.total > 0);

  return (
    <div className="space-y-4">
      {/* Header with overall progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <DDProgressCircle
            stats={status}
            size={56}
            strokeWidth={5}
          />
          <div>
            <div className="text-sm font-medium text-gray-900">
              {status.completed || 0}/{status.total - (status.notApplicable || 0) || 0} items complete
            </div>
            <div className="text-xs text-gray-500">
              Due Diligence Progress
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={createPageUrl('DealDueDiligence', { dealId })}>
            View All
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* Alert badges */}
      {(overdueCount > 0 || blockedCount > 0 || needsReviewCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <Clock className="h-3 w-3" />
              {overdueCount} Overdue
            </Badge>
          )}
          {blockedCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {blockedCount} Blocked
            </Badge>
          )}
          {needsReviewCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <FileText className="h-3 w-3" />
              {needsReviewCount} Pending Approval
            </Badge>
          )}
        </div>
      )}

      {/* Category progress bars */}
      <div className="space-y-2">
        {categoryStats.slice(0, 6).map(cat => (
          <div key={cat.code} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-28 truncate" title={cat.name}>
              {cat.name}
            </span>
            <div className="flex-1">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    cat.percent >= 100 ? 'bg-green-500' : 'bg-blue-500'
                  )}
                  style={{ width: `${cat.percent}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 w-12 text-right">
              {cat.completed}/{cat.total}
            </span>
          </div>
        ))}
        {categoryStats.length > 6 && (
          <div className="text-xs text-gray-400 text-center">
            +{categoryStats.length - 6} more categories
          </div>
        )}
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="border-t pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Next Actions
          </div>
          <div className="space-y-1.5">
            {suggestions.map((suggestion, idx) => (
              <Link
                key={idx}
                to={createPageUrl('DealDueDiligence', { dealId, itemId: suggestion.itemId })}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded px-2 py-1 -mx-2 transition-colors"
              >
                <ArrowRight className="h-3 w-3 text-gray-400" />
                <span className="truncate">{suggestion.title}</span>
                {suggestion.priority === 'CRITICAL' && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0">
                    Critical
                  </Badge>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Risk Alerts */}
      {risks.length > 0 && (
        <div className="border-t pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Risk Alerts
          </div>
          <div className="space-y-1">
            {risks.slice(0, 2).map((risk, idx) => (
              <div key={idx} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                {risk.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-gray-700 mb-2">
            Recent Activity
          </div>
          <div className="space-y-1">
            {recentActivity.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-gray-500">
                <StatusIcon status={item.status} className="h-3 w-3" />
                <span className="truncate flex-1">{item.title}</span>
                <span className="text-gray-400">
                  {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Status icon component
 */
function StatusIcon({ status, className }) {
  const icons = {
    NOT_STARTED: <div className={cn('rounded-full bg-gray-300', className)} />,
    IN_PROGRESS: <Clock className={cn('text-blue-500', className)} />,
    WAITING: <Clock className={cn('text-amber-500', className)} />,
    BLOCKED: <AlertTriangle className={cn('text-red-500', className)} />,
    COMPLETE: <CheckCircle2 className={cn('text-green-500', className)} />,
    'N/A': <div className={cn('rounded-full bg-gray-200', className)} />,
  };
  return icons[status] || icons.NOT_STARTED;
}

/**
 * Initialize prompt when no checklist exists
 */
function DDInitializePrompt({ dealId }) {
  return (
    <div className="text-center py-6">
      <ListChecks className="h-10 w-10 text-gray-300 mx-auto mb-3" />
      <h4 className="text-sm font-medium text-gray-900 mb-1">
        Due Diligence Checklist
      </h4>
      <p className="text-xs text-gray-500 mb-4">
        Initialize the DD checklist to track all required items
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link to={createPageUrl('DealDueDiligence', { dealId })}>
          Get Started
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export default DDOverviewCard;
