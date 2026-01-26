import React from 'react';
import {
  Filter,
  X,
  User,
  Calendar,
  Sparkles,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Status tab options
 */
const STATUS_TABS = [
  { value: 'all', label: 'All', icon: null },
  { value: 'NOT_STARTED', label: 'Pending', icon: null },
  { value: 'IN_PROGRESS', label: 'In Progress', icon: Clock },
  { value: 'WAITING', label: 'Waiting', icon: null },
  { value: 'BLOCKED', label: 'Blocked', icon: AlertTriangle },
  { value: 'COMPLETE', label: 'Complete', icon: CheckCircle2 },
];

/**
 * Smart preset options
 */
const SMART_PRESETS = [
  { value: 'my_items', label: 'My Items', icon: User },
  { value: 'critical', label: 'Critical Path', icon: AlertTriangle },
  { value: 'overdue', label: 'Overdue', icon: Clock },
  { value: 'pending_approval', label: 'Pending Approval', icon: CheckCircle2 },
  { value: 'ai_flagged', label: 'AI Flagged', icon: Sparkles },
  { value: 'due_soon', label: 'Due This Week', icon: Calendar },
];

/**
 * DDFilterBar - Filter controls for DD checklist
 *
 * Shows:
 * - Status tabs (pill buttons)
 * - Smart preset dropdown
 * - Multi-select filters (category, assignee, due date, priority)
 * - Clear filters button
 * - Active filter chips with remove
 */
export function DDFilterBar({
  filters,
  onFilterChange,
  categories = [],
  assignees = [],
  counts = {},
}) {
  const {
    status = 'all',
    preset = null,
    category = null,
    assignee = null,
    dueDate = null,
    priority = null,
    hasDocuments = null,
    aiFlag = null,
  } = filters || {};

  const activeFilterCount = [category, assignee, dueDate, priority, hasDocuments, aiFlag, preset]
    .filter(Boolean).length;

  const setFilter = (key, value) => {
    onFilterChange?.({
      ...filters,
      [key]: value,
    });
  };

  const clearFilter = (key) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFilterChange?.(newFilters);
  };

  const clearAllFilters = () => {
    onFilterChange?.({ status: 'all' });
  };

  return (
    <div className="space-y-3">
      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter('status', tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              status === tab.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {tab.icon && <tab.icon className="h-3.5 w-3.5 mr-1.5 inline" />}
            {tab.label}
            {counts[tab.value] !== undefined && (
              <span className={cn(
                'ml-1.5 text-xs',
                status === tab.value ? 'text-gray-300' : 'text-gray-400'
              )}>
                {counts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Smart presets */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {preset ? SMART_PRESETS.find(p => p.value === preset)?.label : 'Smart Filters'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Quick Filters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SMART_PRESETS.map(item => (
              <DropdownMenuItem
                key={item.value}
                onClick={() => setFilter('preset', preset === item.value ? null : item.value)}
                className={cn(preset === item.value && 'bg-gray-100')}
              >
                <item.icon className="h-4 w-4 mr-2 text-gray-500" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Category filter */}
        {categories.length > 0 && (
          <Select value={category || ''} onValueChange={(v) => setFilter('category', v || null)}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.code} value={cat.code}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Assignee filter */}
        {assignees.length > 0 && (
          <Select value={assignee || ''} onValueChange={(v) => setFilter('assignee', v || null)}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Assignees</SelectItem>
              {assignees.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Due date filter */}
        <Select value={dueDate || ''} onValueChange={(v) => setFilter('dueDate', v || null)}>
          <SelectTrigger className="w-[130px] h-8">
            <SelectValue placeholder="Due Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any Due Date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="no_date">No Due Date</SelectItem>
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select value={priority || ''} onValueChange={(v) => setFilter('priority', v || null)}>
          <SelectTrigger className="w-[120px] h-8">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any Priority</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>

        {/* More filters dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              More
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Additional Filters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={hasDocuments === true}
              onCheckedChange={(c) => setFilter('hasDocuments', c ? true : null)}
            >
              Has Documents
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={hasDocuments === false}
              onCheckedChange={(c) => setFilter('hasDocuments', c ? false : null)}
            >
              Missing Documents
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={aiFlag === true}
              onCheckedChange={(c) => setFilter('aiFlag', c ? true : null)}
            >
              AI Suggestions
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Clear all */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500"
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {preset && (
            <FilterChip
              label={SMART_PRESETS.find(p => p.value === preset)?.label || preset}
              onRemove={() => clearFilter('preset')}
            />
          )}
          {category && (
            <FilterChip
              label={categories.find(c => c.code === category)?.name || category}
              onRemove={() => clearFilter('category')}
            />
          )}
          {assignee && (
            <FilterChip
              label={assignees.find(a => a.id === assignee)?.name || 'Assigned'}
              onRemove={() => clearFilter('assignee')}
            />
          )}
          {dueDate && (
            <FilterChip
              label={formatDueDateFilter(dueDate)}
              onRemove={() => clearFilter('dueDate')}
            />
          )}
          {priority && (
            <FilterChip
              label={`${priority} Priority`}
              onRemove={() => clearFilter('priority')}
            />
          )}
          {hasDocuments !== null && (
            <FilterChip
              label={hasDocuments ? 'Has Docs' : 'Missing Docs'}
              onRemove={() => clearFilter('hasDocuments')}
            />
          )}
          {aiFlag && (
            <FilterChip
              label="AI Flagged"
              onRemove={() => clearFilter('aiFlag')}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Filter chip component
 */
function FilterChip({ label, onRemove }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        onClick={onRemove}
        className="ml-1 p-0.5 hover:bg-gray-200 rounded"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

/**
 * Format due date filter label
 */
function formatDueDateFilter(value) {
  const labels = {
    overdue: 'Overdue',
    today: 'Due Today',
    this_week: 'This Week',
    this_month: 'This Month',
    no_date: 'No Due Date',
  };
  return labels[value] || value;
}

export default DDFilterBar;
