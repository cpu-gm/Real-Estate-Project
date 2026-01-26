import React, { useState } from 'react';
import {
  ChevronDown,
  AlertTriangle,
  Clock,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DDItemRow } from './DDItemRow';
import { DDProgressCompact } from './DDProgressBar';

/**
 * DDCategoryAccordion - Collapsible category grouping for DD items
 *
 * Shows:
 * - Header: Category name, icon, progress bar, item count (x/y complete)
 * - Collapsed: Shows overdue/blocked count badges
 * - Expanded: List of DDItemRow components
 * - Add custom item button (if category allows)
 */
export function DDCategoryAccordion({
  category,
  items,
  defaultExpanded = false,
  onItemClick,
  onStatusChange,
  onAssign,
  onAddCustomItem,
  selectedItemId,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate stats
  const total = items.length;
  const completed = items.filter(i => i.status === 'COMPLETE').length;
  const notApplicable = items.filter(i => i.status === 'N/A').length;
  const blocked = items.filter(i => i.status === 'BLOCKED').length;
  const now = new Date();
  const overdue = items.filter(i =>
    i.dueDate && new Date(i.dueDate) < now && i.status !== 'COMPLETE' && i.status !== 'N/A'
  ).length;
  const inProgress = items.filter(i => i.status === 'IN_PROGRESS').length;

  const stats = { total, completed, notApplicable, blocked, inProgress };
  const applicable = total - notApplicable;
  const percent = applicable > 0 ? Math.round((completed / applicable) * 100) : 0;

  // Determine category icon and color
  const categoryStyles = getCategoryStyles(category.code);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-3 p-4 text-left transition-colors',
          isExpanded ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
        )}
      >
        {/* Icon */}
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          categoryStyles.bgColor
        )}>
          <FolderOpen className={cn('h-4 w-4', categoryStyles.iconColor)} />
        </div>

        {/* Title and progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">
              {category.name}
            </span>
            {percent === 100 && (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-[10px]">
                Complete
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <DDProgressCompact stats={stats} />
          </div>
        </div>

        {/* Alert badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {overdue > 0 && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <Clock className="h-3 w-3" />
              {overdue}
            </Badge>
          )}
          {blocked > 0 && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" />
              {blocked}
            </Badge>
          )}
        </div>

        {/* Expand chevron */}
        <ChevronDown className={cn(
          'h-5 w-5 text-gray-400 transition-transform flex-shrink-0',
          isExpanded && 'rotate-180'
        )} />
      </button>

      {/* Items list */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No items in this category
            </div>
          ) : (
            <>
              {items.map(item => (
                <DDItemRow
                  key={item.id}
                  item={item}
                  onClick={onItemClick}
                  onStatusChange={onStatusChange}
                  onAssign={onAssign}
                  isExpanded={selectedItemId === item.id}
                />
              ))}
            </>
          )}

          {/* Add custom item */}
          {onAddCustomItem && category.allowCustomItems !== false && (
            <div className="p-3 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-gray-500 hover:text-gray-700"
                onClick={() => onAddCustomItem(category.code)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Item
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get styling for category based on code
 */
function getCategoryStyles(code) {
  const styles = {
    TITLE_SURVEY: { bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
    ENVIRONMENTAL: { bgColor: 'bg-green-100', iconColor: 'text-green-600' },
    PROPERTY_CONDITION: { bgColor: 'bg-amber-100', iconColor: 'text-amber-600' },
    LEGAL_COMPLIANCE: { bgColor: 'bg-purple-100', iconColor: 'text-purple-600' },
    FINANCIAL: { bgColor: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    TENANT_LEASE: { bgColor: 'bg-cyan-100', iconColor: 'text-cyan-600' },
    INSURANCE: { bgColor: 'bg-indigo-100', iconColor: 'text-indigo-600' },
    TAX: { bgColor: 'bg-rose-100', iconColor: 'text-rose-600' },
    UTILITIES: { bgColor: 'bg-orange-100', iconColor: 'text-orange-600' },
    ZONING_PERMITS: { bgColor: 'bg-teal-100', iconColor: 'text-teal-600' },
    THIRD_PARTY_REPORTS: { bgColor: 'bg-violet-100', iconColor: 'text-violet-600' },
    CLOSING_DOCUMENTS: { bgColor: 'bg-slate-100', iconColor: 'text-slate-600' },
  };
  return styles[code] || { bgColor: 'bg-gray-100', iconColor: 'text-gray-600' };
}

/**
 * DDCategoryList - Renders all categories as accordions
 */
export function DDCategoryList({
  categories,
  items,
  defaultExpandedCategories = [],
  onItemClick,
  onStatusChange,
  onAssign,
  onAddCustomItem,
  selectedItemId,
}) {
  // Group items by category
  const itemsByCategory = new Map();
  categories.forEach(cat => {
    itemsByCategory.set(cat.code, []);
  });
  items.forEach(item => {
    const catItems = itemsByCategory.get(item.categoryCode);
    if (catItems) {
      catItems.push(item);
    }
  });

  return (
    <div className="space-y-3">
      {categories.map(category => {
        const categoryItems = itemsByCategory.get(category.code) || [];
        // Skip empty categories unless they're meant to show
        if (categoryItems.length === 0 && !category.showEmpty) {
          return null;
        }

        return (
          <DDCategoryAccordion
            key={category.code}
            category={category}
            items={categoryItems}
            defaultExpanded={defaultExpandedCategories.includes(category.code)}
            onItemClick={onItemClick}
            onStatusChange={onStatusChange}
            onAssign={onAssign}
            onAddCustomItem={onAddCustomItem}
            selectedItemId={selectedItemId}
          />
        );
      })}
    </div>
  );
}

export default DDCategoryAccordion;
