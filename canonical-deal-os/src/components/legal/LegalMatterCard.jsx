/**
 * Legal Matter Card Component
 *
 * Displays a single legal matter in the Kanban board.
 * Shows:
 * - Title and matter number
 * - Deal name (if linked)
 * - Priority badge
 * - Aging color indicator
 * - Due date
 * - Assigned user
 */

import React from 'react';
import {
  Building2,
  Calendar,
  User,
  AlertCircle,
  Flag,
  Lock
} from 'lucide-react';

export default function LegalMatterCard({
  matter,
  onClick,
  draggable = true,
  onDragStart,
  onDragEnd
}) {
  const {
    id,
    title,
    matterNumber,
    dealName,
    priority,
    dueDate,
    assignedToName,
    agingColor,
    isPrivileged,
    matterType
  } = matter;

  // Format due date
  const formatDueDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true };
    if (diffDays === 0) return { text: 'Due today', urgent: true };
    if (diffDays === 1) return { text: 'Due tomorrow', urgent: true };
    if (diffDays <= 7) return { text: `${diffDays}d left`, urgent: false };
    return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false };
  };

  const dueDateInfo = formatDueDate(dueDate);

  // Priority badge styles
  const priorityStyles = {
    URGENT: 'bg-red-100 text-red-700 border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    NORMAL: 'bg-gray-100 text-gray-600 border-gray-200',
    LOW: 'bg-blue-50 text-blue-600 border-blue-200'
  };

  // Aging color styles
  const agingStyles = {
    green: 'border-l-green-500',
    yellow: 'border-l-yellow-500',
    red: 'border-l-red-500'
  };

  // Matter type labels
  const matterTypeLabels = {
    DEAL_SPECIFIC: 'Deal',
    ENTITY_CORPORATE: 'Entity',
    INVESTOR_RELATIONS: 'Investor',
    ONGOING_RECURRING: 'Ongoing'
  };

  return (
    <div
      data-testid="matter-card"
      className={`
        bg-white rounded-lg border shadow-sm p-3 cursor-pointer
        hover:shadow-md transition-all
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
        ${agingColor ? `border-l-4 ${agingStyles[agingColor]}` : ''}
      `}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Header: Title + Priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm leading-tight truncate">
            {title}
          </h4>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span>{matterNumber}</span>
            {isPrivileged && (
              <span className="flex items-center gap-0.5 text-purple-600" title="Privileged">
                <Lock className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
        {priority && priority !== 'NORMAL' && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${priorityStyles[priority]}`}>
            {priority === 'URGENT' && <AlertCircle className="h-3 w-3 inline mr-0.5" />}
            {priority}
          </span>
        )}
      </div>

      {/* Deal Link */}
      {dealName && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
          <Building2 className="h-3 w-3 text-gray-400" />
          <span className="truncate">{dealName}</span>
        </div>
      )}

      {/* Footer: Type, Due Date, Assignee */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {/* Matter Type */}
          <span className="text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {matterTypeLabels[matterType] || matterType}
          </span>

          {/* Due Date */}
          {dueDateInfo && (
            <span className={`flex items-center gap-1 ${dueDateInfo.urgent ? 'text-red-600' : 'text-gray-500'}`}>
              <Calendar className="h-3 w-3" />
              {dueDateInfo.text}
            </span>
          )}
        </div>

        {/* Assignee */}
        {assignedToName && (
          <span className="flex items-center gap-1 text-gray-500" title={`Assigned to ${assignedToName}`}>
            <User className="h-3 w-3" />
            <span className="truncate max-w-[60px]">{assignedToName.split(' ')[0]}</span>
          </span>
        )}
      </div>
    </div>
  );
}
