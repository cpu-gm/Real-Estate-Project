/**
 * useBulkSelection Hook
 *
 * Manages bulk selection state for lists with support for:
 * - Single item toggle
 * - Shift+click range selection
 * - Select all / clear all
 * - Selection count tracking
 *
 * @returns {Object} Selection state and methods
 */

import { useState, useCallback, useRef } from 'react';
import { createLogger } from '@/lib/debug-logger';

const logger = createLogger('ui:bulk-ops');

export function useBulkSelection() {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const lastSelectedRef = useRef(null);
  const itemOrderRef = useRef([]);

  /**
   * Check if an item is selected
   */
  const isSelected = useCallback((id) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  /**
   * Toggle single item selection
   */
  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        logger.debug('Selection removed', { id, count: next.size });
      } else {
        next.add(id);
        logger.debug('Selection added', { id, count: next.size });
      }
      return next;
    });
    lastSelectedRef.current = id;
  }, []);

  /**
   * Toggle with shift+click range selection support
   * @param {string} id - The item ID to toggle
   * @param {boolean} shiftKey - Whether shift key is pressed
   * @param {string[]} orderedIds - Current order of all item IDs
   */
  const toggleRange = useCallback((id, shiftKey, orderedIds = []) => {
    // Update the item order reference
    if (orderedIds.length > 0) {
      itemOrderRef.current = orderedIds;
    }

    if (!shiftKey || !lastSelectedRef.current || itemOrderRef.current.length === 0) {
      // Normal toggle
      toggle(id);
      return;
    }

    // Range selection
    const ids = itemOrderRef.current;
    const lastIndex = ids.indexOf(lastSelectedRef.current);
    const currentIndex = ids.indexOf(id);

    if (lastIndex === -1 || currentIndex === -1) {
      // Fallback to normal toggle if indexes not found
      toggle(id);
      return;
    }

    // Get range bounds
    const startIndex = Math.min(lastIndex, currentIndex);
    const endIndex = Math.max(lastIndex, currentIndex);

    // Select all items in range
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = startIndex; i <= endIndex; i++) {
        next.add(ids[i]);
      }
      logger.debug('Range selection', {
        startIndex,
        endIndex,
        rangeCount: endIndex - startIndex + 1,
        totalCount: next.size,
      });
      return next;
    });

    lastSelectedRef.current = id;
  }, [toggle]);

  /**
   * Select all items
   * @param {string[]} ids - Array of all item IDs to select
   */
  const selectAll = useCallback((ids) => {
    setSelectedIds(new Set(ids));
    itemOrderRef.current = ids;
    logger.debug('Select all', { count: ids.length });
  }, []);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedRef.current = null;
    logger.debug('Selection cleared');
  }, []);

  /**
   * Get array of selected IDs
   */
  const getSelectedArray = useCallback(() => {
    return Array.from(selectedIds);
  }, [selectedIds]);

  return {
    selectedIds,
    isSelected,
    toggle,
    toggleRange,
    selectAll,
    clearSelection,
    selectionCount: selectedIds.size,
    getSelectedArray,
  };
}

export default useBulkSelection;
