/**
 * BulkProgressModal Component
 *
 * Shows progress during bulk operations with:
 * - Progress bar showing completion
 * - Real-time success/failure counts
 * - Expandable error details
 * - Final summary
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {string} props.title - Operation title
 * @param {number} props.total - Total items to process
 * @param {number} props.completed - Number of items processed
 * @param {Array} props.succeeded - Array of successful item IDs
 * @param {Array} props.failed - Array of { id, error } objects
 * @param {boolean} props.isComplete - Whether operation is finished
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { createLogger } from '@/lib/debug-logger';

const logger = createLogger('ui:bulk-ops');

export function BulkProgressModal({
  isOpen,
  onClose,
  title = 'Processing...',
  total = 0,
  completed = 0,
  succeeded = [],
  failed = [],
  isComplete = false,
}) {
  const [showErrors, setShowErrors] = useState(false);

  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hasErrors = failed.length > 0;
  const allSucceeded = isComplete && failed.length === 0;

  logger.debug('BulkProgressModal render', {
    total,
    completed,
    succeeded: succeeded.length,
    failed: failed.length,
    isComplete,
    progressPercent,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && isComplete && onClose?.()}>
      <DialogContent
        data-testid="bulk-progress-modal"
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          // Prevent closing while in progress
          if (!isComplete) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing while in progress
          if (!isComplete) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!isComplete && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
            {isComplete && allSucceeded && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            {isComplete && hasErrors && <AlertTriangle className="w-5 h-5 text-amber-500" />}
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Processing {completed} of {total}...
              </span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Status Counts */}
          {isComplete && (
            <div
              data-testid="bulk-complete"
              className="flex items-center gap-6 pt-2"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span data-testid="success-count" className="text-sm">
                  <span className="font-medium text-green-700">{succeeded.length}</span> succeeded
                </span>
              </div>
              {hasErrors && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span data-testid="failure-count" className="text-sm">
                    <span className="font-medium text-red-600">{failed.length}</span> failed
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error Details (Expandable) */}
          {isComplete && hasErrors && (
            <div className="border border-red-200 rounded-lg bg-red-50 overflow-hidden">
              <button
                data-testid="toggle-errors"
                onClick={() => setShowErrors(!showErrors)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-red-700 hover:bg-red-100"
              >
                <span>View failed items ({failed.length})</span>
                {showErrors ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showErrors && (
                <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto border-t border-red-200">
                  {failed.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="flex items-start gap-2 text-xs py-1"
                    >
                      <XCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-red-800">
                          {item.name || item.id}
                        </span>
                        <span className="text-red-600 ml-1">
                          - {item.error || 'Unknown error'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Success Message */}
          {isComplete && allSucceeded && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700">
                All {succeeded.length} items processed successfully!
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            data-testid="close-progress-modal"
            onClick={() => {
              logger.debug('Progress modal closed', {
                succeeded: succeeded.length,
                failed: failed.length,
              });
              onClose?.();
            }}
            disabled={!isComplete}
            variant={isComplete ? 'default' : 'secondary'}
          >
            {isComplete ? 'Done' : 'Please wait...'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkProgressModal;
