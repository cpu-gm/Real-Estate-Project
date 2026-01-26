import React from 'react';
import { cn } from '@/lib/utils';

/**
 * DDProgressBar - Visual progress indicator for DD checklist completion
 *
 * Shows segmented progress bar with:
 * - Complete (green)
 * - In Progress (blue)
 * - Waiting (amber)
 * - Blocked (red)
 * - Pending (gray)
 */
export function DDProgressBar({
  stats,
  size = 'default',
  showLabels = true,
  showPercentage = true,
  className,
}) {
  const {
    total = 0,
    completed = 0,
    inProgress = 0,
    waiting = 0,
    blocked = 0,
    notApplicable = 0,
  } = stats || {};

  // Calculate applicable items (exclude N/A)
  const applicable = total - notApplicable;
  const pending = applicable - completed - inProgress - waiting - blocked;

  // Calculate percentages
  const getPercent = (count) => (applicable > 0 ? (count / applicable) * 100 : 0);
  const completedPercent = getPercent(completed);
  const inProgressPercent = getPercent(inProgress);
  const waitingPercent = getPercent(waiting);
  const blockedPercent = getPercent(blocked);
  const pendingPercent = getPercent(pending);

  const overallPercent = applicable > 0 ? Math.round((completed / applicable) * 100) : 0;

  const heights = {
    sm: 'h-1.5',
    default: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Progress bar */}
      <div className={cn('w-full bg-gray-100 rounded-full overflow-hidden flex', heights[size])}>
        {completed > 0 && (
          <div
            className="bg-green-500 transition-all duration-300"
            style={{ width: `${completedPercent}%` }}
            title={`${completed} complete`}
          />
        )}
        {inProgress > 0 && (
          <div
            className="bg-blue-500 transition-all duration-300"
            style={{ width: `${inProgressPercent}%` }}
            title={`${inProgress} in progress`}
          />
        )}
        {waiting > 0 && (
          <div
            className="bg-amber-400 transition-all duration-300"
            style={{ width: `${waitingPercent}%` }}
            title={`${waiting} waiting`}
          />
        )}
        {blocked > 0 && (
          <div
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${blockedPercent}%` }}
            title={`${blocked} blocked`}
          />
        )}
        {pending > 0 && (
          <div
            className="bg-gray-300 transition-all duration-300"
            style={{ width: `${pendingPercent}%` }}
            title={`${pending} pending`}
          />
        )}
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {completed}
            </span>
            {inProgress > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {inProgress}
              </span>
            )}
            {waiting > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {waiting}
              </span>
            )}
            {blocked > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {blocked}
              </span>
            )}
          </div>
          {showPercentage && (
            <span className="text-xs font-medium text-gray-700">
              {overallPercent}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact progress indicator showing only percentage and count
 */
export function DDProgressCompact({ stats, className }) {
  const {
    total = 0,
    completed = 0,
    notApplicable = 0,
  } = stats || {};

  const applicable = total - notApplicable;
  const percent = applicable > 0 ? Math.round((completed / applicable) * 100) : 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {completed}/{applicable}
      </span>
    </div>
  );
}

/**
 * Circular progress indicator
 */
export function DDProgressCircle({
  stats,
  size = 64,
  strokeWidth = 6,
  showPercentage = true,
  className,
}) {
  const {
    total = 0,
    completed = 0,
    notApplicable = 0,
  } = stats || {};

  const applicable = total - notApplicable;
  const percent = applicable > 0 ? Math.round((completed / applicable) * 100) : 0;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#22c55e"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      {showPercentage && (
        <span className="absolute text-sm font-semibold text-gray-700">
          {percent}%
        </span>
      )}
    </div>
  );
}

export default DDProgressBar;
