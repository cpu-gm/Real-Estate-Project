/**
 * SelectableCard Component
 *
 * Wrapper component that adds checkbox selection overlay to cards.
 * Supports:
 * - Checkbox in top-left corner
 * - Visual selection state (ring highlight)
 * - Prevents navigation on checkbox click
 * - Works with existing card components
 *
 * @param {Object} props
 * @param {string} props.id - Item ID for selection
 * @param {boolean} props.isSelected - Whether item is selected
 * @param {Function} props.onToggle - Callback when checkbox is toggled (receives event)
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Disable selection
 */

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';

const logger = createLogger('ui:bulk-ops');

export function SelectableCard({
  id,
  isSelected,
  onToggle,
  children,
  className,
  disabled = false,
  testId = 'selectable-checkbox',
}) {
  const handleCheckboxClick = (e) => {
    // Stop propagation to prevent card click handlers from firing
    e.stopPropagation();

    logger.debug('SelectableCard toggle', { id, wasSelected: isSelected, shiftKey: e.shiftKey });

    // Pass the event so parent can check for shift key
    onToggle?.(e);
  };

  const handleCheckboxKeyDown = (e) => {
    // Allow keyboard interaction
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
      e.preventDefault();
      onToggle?.(e);
    }
  };

  return (
    <div
      className={cn(
        'relative group',
        className
      )}
    >
      {/* Checkbox Overlay */}
      <div
        data-testid={testId}
        className={cn(
          'absolute top-2 left-2 z-10',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isSelected && 'opacity-100', // Always show when selected
        )}
      >
        <div
          className={cn(
            'p-1.5 rounded-md',
            'bg-white/90 backdrop-blur-sm shadow-sm',
            'border border-slate-200',
            'hover:border-slate-300'
          )}
          onClick={handleCheckboxClick}
          onKeyDown={handleCheckboxKeyDown}
          role="checkbox"
          aria-checked={isSelected}
          tabIndex={disabled ? -1 : 0}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => {}} // Handled by parent div
            disabled={disabled}
            className={cn(
              'data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600',
              'cursor-pointer'
            )}
            aria-label={`Select item ${id}`}
          />
        </div>
      </div>

      {/* Card Content with Selection Ring */}
      <div
        className={cn(
          'transition-all duration-150',
          isSelected && 'ring-2 ring-blue-500 ring-offset-2 rounded-xl'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default SelectableCard;
