/**
 * BulkActionBar Component
 *
 * Fixed bottom action bar that appears when items are selected.
 * Displays selection count and available bulk actions.
 *
 * @param {Object} props
 * @param {number} props.count - Number of selected items
 * @param {Array} props.actions - Array of action objects { label, onClick, icon, variant }
 * @param {Function} props.onClear - Callback to clear selection
 * @param {string} props.className - Additional CSS classes
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { X, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';

const logger = createLogger('ui:bulk-ops');

export function BulkActionBar({
  count,
  actions = [],
  onClear,
  className,
}) {
  // Don't render if nothing selected
  if (count === 0) {
    return null;
  }

  logger.debug('BulkActionBar render', { count, actionCount: actions.length });

  return (
    <div
      data-testid="bulk-action-bar"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-slate-900 text-white shadow-lg',
        'border-t border-slate-700',
        'transform transition-transform duration-200',
        'animate-in slide-in-from-bottom-2',
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Selection Count */}
          <div className="flex items-center gap-3">
            <CheckSquare className="w-5 h-5 text-blue-400" />
            <span
              data-testid="selected-count"
              className="font-medium"
            >
              {count} {count === 1 ? 'item' : 'items'} selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={index}
                  data-testid={action.testId || action['data-testid'] || `bulk-action-${index}`}
                  variant={action.variant || (index === 0 ? 'default' : 'secondary')}
                  size="sm"
                  onClick={() => {
                    logger.debug('Bulk action clicked', { label: action.label, count });
                    action.onClick?.();
                  }}
                  className={cn(
                    index === 0 && 'bg-blue-600 hover:bg-blue-700',
                    index !== 0 && 'bg-slate-700 hover:bg-slate-600 text-white'
                  )}
                  disabled={action.disabled}
                >
                  {Icon && <Icon className="w-4 h-4 mr-1" />}
                  {action.label}
                </Button>
              );
            })}

            {/* Clear Selection */}
            <Button
              data-testid="clear-selection"
              variant="ghost"
              size="sm"
              onClick={() => {
                logger.debug('Clear selection clicked');
                onClear?.();
              }}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BulkActionBar;
