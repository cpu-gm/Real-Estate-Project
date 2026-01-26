import React, { useState } from 'react';
import {
  Circle,
  Clock,
  Pause,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  ChevronDown,
  FileText,
  User,
  Calendar,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDueDate, getStatusColor } from '@/api/dd';

/**
 * DDItemRow - Compact item display with expandable details
 *
 * Shows:
 * - Status icon (color-coded)
 * - Item name
 * - Assignee avatar
 * - Due date (red if overdue)
 * - Document count badge
 * - AI flag indicator
 * - Expand chevron for inline details
 *
 * Expanded state shows:
 * - Full description
 * - Quick actions
 * - Recent notes preview
 * - Linked documents
 */
export function DDItemRow({
  item,
  onClick,
  onStatusChange,
  onAssign,
  isExpanded: controlledExpanded,
  onExpandChange,
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpanded = onExpandChange || (() => setInternalExpanded(!internalExpanded));

  const dueInfo = formatDueDate(item.dueDate);
  const hasDocuments = item.documentCount > 0 || (item.linkedDocuments && item.linkedDocuments.length > 0);
  const hasAISuggestion = item.aiSuggested || item.hasAIMatch;

  return (
    <div
      className={cn(
        'border-b border-gray-100 last:border-0 transition-colors',
        onClick && 'cursor-pointer hover:bg-gray-50'
      )}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 py-3 px-4"
        onClick={() => onClick?.(item)}
      >
        {/* Status icon */}
        <StatusIcon status={item.status} className="h-4 w-4 flex-shrink-0" />

        {/* Title and priority */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-sm truncate',
              item.status === 'COMPLETE' ? 'text-gray-500 line-through' : 'text-gray-900'
            )}>
              {item.title || item.name}
            </span>
            {item.priority === 'CRITICAL' && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                Critical
              </Badge>
            )}
            {item.priority === 'HIGH' && (
              <Badge variant="default" className="text-[10px] px-1 py-0 bg-orange-500">
                High
              </Badge>
            )}
          </div>
          {item.categoryName && (
            <span className="text-xs text-gray-400">{item.categoryName}</span>
          )}
        </div>

        {/* Assignee */}
        {item.assigneeName && (
          <Avatar className="h-6 w-6 flex-shrink-0">
            <AvatarFallback className="text-[10px] bg-gray-100">
              {item.assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Due date */}
        {dueInfo && (
          <span className={cn(
            'text-xs whitespace-nowrap flex-shrink-0',
            dueInfo.urgent ? 'text-red-600 font-medium' : 'text-gray-500'
          )}>
            {dueInfo.text}
          </span>
        )}

        {/* Document count */}
        {hasDocuments && (
          <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
            <FileText className="h-3.5 w-3.5" />
            <span className="text-xs">{item.documentCount || item.linkedDocuments?.length || 0}</span>
          </div>
        )}

        {/* AI flag */}
        {hasAISuggestion && (
          <Sparkles className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" title="AI suggestion available" />
        )}

        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
          className="p-1 hover:bg-gray-100 rounded flex-shrink-0"
        >
          <ChevronDown className={cn(
            'h-4 w-4 text-gray-400 transition-transform',
            isExpanded && 'rotate-180'
          )} />
        </button>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onStatusChange?.(item.id, 'IN_PROGRESS')}>
              <Clock className="h-4 w-4 mr-2 text-blue-500" />
              Mark In Progress
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange?.(item.id, 'COMPLETE')}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
              Mark Complete
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange?.(item.id, 'BLOCKED')}>
              <AlertTriangle className="h-4 w-4 mr-2 text-red-500" />
              Mark Blocked
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAssign?.(item.id)}>
              <User className="h-4 w-4 mr-2" />
              Assign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 ml-7 space-y-3 border-t border-gray-50">
          {/* Description */}
          {item.description && (
            <p className="text-sm text-gray-600">{item.description}</p>
          )}

          {/* Quick info grid */}
          <div className="flex flex-wrap gap-3 text-xs">
            {item.assigneeName && (
              <div className="flex items-center gap-1.5 text-gray-500">
                <User className="h-3.5 w-3.5" />
                {item.assigneeName}
              </div>
            )}
            {item.dueDate && (
              <div className={cn(
                'flex items-center gap-1.5',
                dueInfo?.urgent ? 'text-red-600' : 'text-gray-500'
              )}>
                <Calendar className="h-3.5 w-3.5" />
                {new Date(item.dueDate).toLocaleDateString()}
              </div>
            )}
            <div className={cn(
              'px-2 py-0.5 rounded-full text-xs',
              getStatusColor(item.status)
            )}>
              {formatStatus(item.status)}
            </div>
          </div>

          {/* Linked documents */}
          {item.linkedDocuments && item.linkedDocuments.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Documents</span>
              <div className="flex flex-wrap gap-1.5">
                {item.linkedDocuments.slice(0, 3).map((doc, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    {doc.name || doc.documentName || `Document ${idx + 1}`}
                  </Badge>
                ))}
                {item.linkedDocuments.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{item.linkedDocuments.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Recent notes */}
          {item.notes && (
            <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
              <span className="font-medium">Note: </span>
              {item.notes}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(item);
              }}
            >
              View Details
            </Button>
            {item.status !== 'COMPLETE' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange?.(item.id, 'COMPLETE');
                }}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Complete
              </Button>
            )}
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
    NOT_STARTED: <Circle className={cn('text-gray-400', className)} />,
    IN_PROGRESS: <Clock className={cn('text-blue-500', className)} />,
    WAITING: <Pause className={cn('text-amber-500', className)} />,
    BLOCKED: <AlertTriangle className={cn('text-red-500', className)} />,
    COMPLETE: <CheckCircle2 className={cn('text-green-500', className)} />,
    'N/A': <MinusCircle className={cn('text-gray-300', className)} />,
  };
  return icons[status] || icons.NOT_STARTED;
}

/**
 * Format status for display
 */
function formatStatus(status) {
  const labels = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    WAITING: 'Waiting',
    BLOCKED: 'Blocked',
    COMPLETE: 'Complete',
    'N/A': 'N/A',
  };
  return labels[status] || status;
}

export default DDItemRow;
