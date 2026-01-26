import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Sparkles,
  AlertTriangle,
  FileText,
  ArrowRight,
  X,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DDAIBanner - Prominent AI features display
 *
 * Shows:
 * - Document match alerts: "3 uploaded documents may match pending items"
 * - Risk warnings: "2 items flagged as potential blockers"
 * - Suggestions: "AI recommends prioritizing Title Review"
 * - Dismissible with "Show me" action buttons
 */
export function DDAIBanner({
  dealId,
  suggestions = [],
  risks = [],
  pendingApprovals = [],
  onItemClick,
}) {
  const [dismissed, setDismissed] = useState({});
  const [expanded, setExpanded] = useState(true);

  const hasSuggestions = suggestions.length > 0;
  const hasRisks = risks.length > 0;
  const hasApprovals = pendingApprovals.length > 0;
  const hasAnyContent = hasSuggestions || hasRisks || hasApprovals;

  if (!hasAnyContent) {
    return null;
  }

  // Filter out dismissed items
  const visibleSuggestions = suggestions.filter(s => !dismissed[`suggestion-${s.itemId || s.id}`]);
  const visibleRisks = risks.filter(r => !dismissed[`risk-${r.id || r.message}`]);
  const visibleApprovals = pendingApprovals.filter(a => !dismissed[`approval-${a.id}`]);

  const hasVisibleContent = visibleSuggestions.length > 0 || visibleRisks.length > 0 || visibleApprovals.length > 0;

  if (!hasVisibleContent) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-amber-900">AI Insights</h3>
            <p className="text-xs text-amber-700">
              {visibleSuggestions.length > 0 && `${visibleSuggestions.length} suggestions`}
              {visibleSuggestions.length > 0 && (visibleRisks.length > 0 || visibleApprovals.length > 0) && ' • '}
              {visibleRisks.length > 0 && `${visibleRisks.length} risks`}
              {visibleRisks.length > 0 && visibleApprovals.length > 0 && ' • '}
              {visibleApprovals.length > 0 && `${visibleApprovals.length} pending approvals`}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-amber-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-amber-400" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Pending Document Approvals */}
          {visibleApprovals.length > 0 && (
            <AISection
              icon={FileText}
              iconColor="text-blue-500"
              bgColor="bg-blue-50"
              borderColor="border-blue-200"
              title="Document Matches"
              subtitle={`${visibleApprovals.length} documents may match pending items`}
            >
              {visibleApprovals.slice(0, 3).map((approval, idx) => (
                <AIItem
                  key={approval.id || idx}
                  title={approval.documentName || 'Document'}
                  subtitle={`Matches: ${approval.itemTitle || 'Pending item'}`}
                  onDismiss={() => setDismissed(d => ({ ...d, [`approval-${approval.id}`]: true }))}
                  onAction={() => onItemClick?.({ id: approval.itemId })}
                  actionLabel="Review Match"
                />
              ))}
              {visibleApprovals.length > 3 && (
                <Button variant="ghost" size="sm" className="w-full text-blue-600">
                  View all {visibleApprovals.length} matches
                </Button>
              )}
            </AISection>
          )}

          {/* Risk Warnings */}
          {visibleRisks.length > 0 && (
            <AISection
              icon={AlertTriangle}
              iconColor="text-red-500"
              bgColor="bg-red-50"
              borderColor="border-red-200"
              title="Risk Alerts"
              subtitle={`${visibleRisks.length} potential issues detected`}
            >
              {visibleRisks.slice(0, 3).map((risk, idx) => (
                <AIItem
                  key={risk.id || idx}
                  title={risk.title || risk.message}
                  subtitle={risk.description || risk.reason}
                  severity="high"
                  onDismiss={() => setDismissed(d => ({ ...d, [`risk-${risk.id || risk.message}`]: true }))}
                  onAction={risk.itemId ? () => onItemClick?.({ id: risk.itemId }) : undefined}
                  actionLabel={risk.itemId ? 'View Item' : undefined}
                />
              ))}
            </AISection>
          )}

          {/* Suggestions */}
          {visibleSuggestions.length > 0 && (
            <AISection
              icon={Lightbulb}
              iconColor="text-amber-500"
              bgColor="bg-amber-50/50"
              borderColor="border-amber-200"
              title="Recommended Actions"
              subtitle="AI-suggested next steps"
            >
              {visibleSuggestions.slice(0, 3).map((suggestion, idx) => (
                <AIItem
                  key={suggestion.itemId || idx}
                  title={suggestion.title}
                  subtitle={suggestion.reason || suggestion.description}
                  priority={suggestion.priority}
                  onDismiss={() => setDismissed(d => ({ ...d, [`suggestion-${suggestion.itemId || suggestion.id}`]: true }))}
                  onAction={() => onItemClick?.({ id: suggestion.itemId })}
                  actionLabel="Go to Item"
                />
              ))}
            </AISection>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * AI Section wrapper
 */
function AISection({ icon: Icon, iconColor, bgColor, borderColor, title, subtitle, children }) {
  return (
    <div className={cn('rounded-lg border p-3', bgColor, borderColor)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-4 w-4', iconColor)} />
        <span className="text-sm font-medium text-gray-800">{title}</span>
        <span className="text-xs text-gray-500">{subtitle}</span>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

/**
 * Individual AI item
 */
function AIItem({ title, subtitle, severity, priority, onDismiss, onAction, actionLabel }) {
  return (
    <div className="flex items-start gap-3 bg-white rounded-md p-2 border border-gray-100">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 truncate">{title}</span>
          {priority === 'CRITICAL' && (
            <Badge variant="destructive" className="text-[10px] px-1">Critical</Badge>
          )}
          {priority === 'HIGH' && (
            <Badge variant="default" className="text-[10px] px-1 bg-orange-500">High</Badge>
          )}
          {severity === 'high' && (
            <Badge variant="destructive" className="text-[10px] px-1">Risk</Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {onAction && actionLabel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-blue-600 hover:text-blue-700"
            onClick={onAction}
          >
            {actionLabel}
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default DDAIBanner;
