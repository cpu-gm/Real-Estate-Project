import React, { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import {
  useChecklist,
  useChecklistItems,
  useChecklistStatus,
  useSuggestions,
  useRisks,
  usePendingApprovals,
  useInitializeChecklist,
  useUpdateItem,
} from '@/api/dd';
import { DDProgressBar, DDProgressCircle } from '@/components/dd/DDProgressBar';
import { DDCategoryList } from '@/components/dd/DDCategoryAccordion';
import { DDFilterBar } from '@/components/dd/DDFilterBar';
import { DDAIBanner } from '@/components/dd/DDAIBanner';
import { DDItemDetailSheet } from '@/components/dd/DDItemDetailSheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  ListChecks,
  AlertTriangle,
  Clock,
  Loader2,
  Plus,
  Download,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * DealDueDiligence - Full page DD management view
 *
 * Features:
 * - Header with deal name, overall progress, smart filter presets
 * - Status tabs and filter bar
 * - AI banner with suggestions, risks, document matches
 * - Accordion list grouped by 12 categories
 * - Item detail sheet slide-out
 * - Bulk actions toolbar
 */
export default function DealDueDiligence() {
  const [searchParams] = useSearchParams();
  const dealId = searchParams.get('dealId');
  const initialItemId = searchParams.get('itemId');

  // State
  const [filters, setFilters] = useState({ status: 'all' });
  const [selectedItemId, setSelectedItemId] = useState(initialItemId || null);
  const [showDetailSheet, setShowDetailSheet] = useState(!!initialItemId);

  // Queries
  const { data: checklistData, isLoading: checklistLoading, error: checklistError, refetch: refetchChecklist } = useChecklist(dealId);
  const { data: statusData, isLoading: statusLoading } = useChecklistStatus(dealId);
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useChecklistItems(dealId, {
    status: filters.status !== 'all' ? filters.status : undefined,
    category: filters.category,
    priority: filters.priority,
  });
  const { data: suggestionsData } = useSuggestions(dealId, 5);
  const { data: risksData } = useRisks(dealId);
  const { data: approvalsData } = usePendingApprovals(dealId);

  // Mutations
  const initializeMutation = useInitializeChecklist();
  const updateItemMutation = useUpdateItem();

  const isLoading = checklistLoading || statusLoading || itemsLoading;

  // Extract data
  const checklist = checklistData?.checklist;
  const status = statusData || {};
  const items = itemsData?.items || [];
  const categories = itemsData?.categories || [];
  const suggestions = suggestionsData?.suggestions || [];
  const risks = risksData?.risks || [];
  const pendingApprovals = approvalsData?.approvals || [];

  // Calculate status counts for filter bar
  const statusCounts = useMemo(() => {
    if (!items.length) return {};
    return {
      all: items.length,
      NOT_STARTED: items.filter(i => i.status === 'NOT_STARTED').length,
      IN_PROGRESS: items.filter(i => i.status === 'IN_PROGRESS').length,
      WAITING: items.filter(i => i.status === 'WAITING').length,
      BLOCKED: items.filter(i => i.status === 'BLOCKED').length,
      COMPLETE: items.filter(i => i.status === 'COMPLETE').length,
    };
  }, [items]);

  // Get unique assignees for filter
  const assignees = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      if (item.assigneeUserId && item.assigneeName) {
        map.set(item.assigneeUserId, { id: item.assigneeUserId, name: item.assigneeName });
      }
    });
    return Array.from(map.values());
  }, [items]);

  // Apply client-side filters for preset/due date
  const filteredItems = useMemo(() => {
    let result = items;

    // Apply preset filters
    if (filters.preset === 'overdue') {
      const now = new Date();
      result = result.filter(i =>
        i.dueDate && new Date(i.dueDate) < now && i.status !== 'COMPLETE' && i.status !== 'N/A'
      );
    } else if (filters.preset === 'critical') {
      result = result.filter(i => i.priority === 'CRITICAL' || i.priority === 'HIGH');
    } else if (filters.preset === 'ai_flagged') {
      result = result.filter(i => i.aiSuggested || i.hasAIMatch);
    }

    // Apply assignee filter
    if (filters.assignee) {
      result = result.filter(i => i.assigneeUserId === filters.assignee);
    }

    // Apply due date filter
    if (filters.dueDate) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const monthEnd = new Date(today);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      switch (filters.dueDate) {
        case 'overdue':
          result = result.filter(i => i.dueDate && new Date(i.dueDate) < today);
          break;
        case 'today':
          result = result.filter(i => {
            if (!i.dueDate) return false;
            const d = new Date(i.dueDate);
            return d >= today && d < new Date(today.getTime() + 86400000);
          });
          break;
        case 'this_week':
          result = result.filter(i => {
            if (!i.dueDate) return false;
            const d = new Date(i.dueDate);
            return d >= today && d < weekEnd;
          });
          break;
        case 'this_month':
          result = result.filter(i => {
            if (!i.dueDate) return false;
            const d = new Date(i.dueDate);
            return d >= today && d < monthEnd;
          });
          break;
        case 'no_date':
          result = result.filter(i => !i.dueDate);
          break;
      }
    }

    return result;
  }, [items, filters]);

  // Handlers
  const handleInitialize = async () => {
    try {
      await initializeMutation.mutateAsync({ dealId, payload: {} });
      toast.success('DD checklist initialized');
      refetchChecklist();
      refetchItems();
    } catch (error) {
      toast.error(error.message || 'Failed to initialize checklist');
    }
  };

  const handleStatusChange = async (itemId, newStatus) => {
    try {
      await updateItemMutation.mutateAsync({
        dealId,
        itemId,
        status: newStatus,
      });
      toast.success(`Item marked as ${newStatus.toLowerCase().replace('_', ' ')}`);
    } catch (error) {
      toast.error(error.message || 'Failed to update item');
    }
  };

  const handleItemClick = (item) => {
    setSelectedItemId(item.id);
    setShowDetailSheet(true);
  };

  const handleAssign = (itemId) => {
    // Open assign modal - for now just open detail sheet
    setSelectedItemId(itemId);
    setShowDetailSheet(true);
  };

  // If no checklist exists
  if (!isLoading && checklistError?.status === 404) {
    return (
      <div className="p-6">
        <Header dealId={dealId} />
        <InitializePrompt onInitialize={handleInitialize} isLoading={initializeMutation.isPending} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Header dealId={dealId} />

          {/* Progress summary */}
          {!isLoading && status && (
            <div className="mt-4 flex items-center gap-6">
              <DDProgressCircle stats={status} size={48} strokeWidth={4} />
              <div className="flex-1">
                <DDProgressBar stats={status} size="lg" showLabels />
              </div>
              <div className="flex items-center gap-3">
                {status.blocked > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {status.blocked} Blocked
                  </Badge>
                )}
                {pendingApprovals.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {pendingApprovals.length} Pending Approval
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* AI Banner */}
            <DDAIBanner
              dealId={dealId}
              suggestions={suggestions}
              risks={risks}
              pendingApprovals={pendingApprovals}
              onItemClick={handleItemClick}
            />

            {/* Filter bar */}
            <DDFilterBar
              filters={filters}
              onFilterChange={setFilters}
              categories={categories}
              assignees={assignees}
              counts={statusCounts}
            />

            {/* Results count */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {filteredItems.length} items
                {filters.status !== 'all' || Object.keys(filters).length > 1
                  ? ' (filtered)'
                  : ''}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchChecklist();
                    refetchItems();
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Category accordions */}
            {filteredItems.length === 0 ? (
              <EmptyState filters={filters} onClearFilters={() => setFilters({ status: 'all' })} />
            ) : (
              <DDCategoryList
                categories={categories}
                items={filteredItems}
                onItemClick={handleItemClick}
                onStatusChange={handleStatusChange}
                onAssign={handleAssign}
                selectedItemId={selectedItemId}
              />
            )}
          </div>
        )}
      </div>

      {/* Item detail sheet */}
      <DDItemDetailSheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        dealId={dealId}
        itemId={selectedItemId}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}

/**
 * Page header
 */
function Header({ dealId }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={createPageUrl('DealOverview', { id: dealId })}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Due Diligence</h1>
          <p className="text-sm text-gray-500">Track and manage all DD checklist items</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>
    </div>
  );
}

/**
 * Initialize prompt when no checklist exists
 */
function InitializePrompt({ onInitialize, isLoading }) {
  return (
    <div className="max-w-lg mx-auto mt-12">
      <Card>
        <CardContent className="pt-6 text-center">
          <ListChecks className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Initialize Due Diligence Checklist
          </h2>
          <p className="text-gray-500 mb-6">
            Create a comprehensive DD checklist from our template library with 116 items
            across 12 categories covering title, environmental, financial, legal, and more.
          </p>
          <Button onClick={onInitialize} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Initialize Checklist
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Empty state when filters return no results
 */
function EmptyState({ filters, onClearFilters }) {
  const hasFilters = filters.status !== 'all' || Object.keys(filters).length > 1;

  return (
    <div className="text-center py-12 bg-white rounded-lg border">
      <ListChecks className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <h3 className="text-lg font-medium text-gray-900">
        {hasFilters ? 'No items match your filters' : 'No items found'}
      </h3>
      <p className="text-gray-500 mt-1 mb-4">
        {hasFilters
          ? 'Try adjusting your filters to see more items'
          : 'Add items to your checklist to get started'}
      </p>
      {hasFilters && (
        <Button variant="outline" onClick={onClearFilters}>
          Clear Filters
        </Button>
      )}
    </div>
  );
}
