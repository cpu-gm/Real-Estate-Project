/**
 * Due Diligence API Hooks
 *
 * React Query hooks for the DD checklist backend.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bff } from './bffClient';

// ==================== QUERY KEYS ====================

export const ddKeys = {
  all: ['dd'],
  checklist: (dealId) => [...ddKeys.all, 'checklist', dealId],
  items: (dealId, filters) => [...ddKeys.all, 'items', dealId, filters],
  item: (itemId) => [...ddKeys.all, 'item', itemId],
  itemHistory: (itemId) => [...ddKeys.all, 'item', itemId, 'history'],
  status: (dealId) => [...ddKeys.all, 'status', dealId],
  suggestions: (dealId) => [...ddKeys.all, 'suggestions', dealId],
  risks: (dealId) => [...ddKeys.all, 'risks', dealId],
  summary: (dealId, audience) => [...ddKeys.all, 'summary', dealId, audience],
  pendingApprovals: (dealId) => [...ddKeys.all, 'approvals', dealId],
  templates: () => [...ddKeys.all, 'templates'],
  categories: () => [...ddKeys.all, 'categories'],
};

// ==================== API FUNCTIONS ====================

const API_BASE = '/api';

async function requestJson(path, options = {}) {
  const authToken = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ==================== API CLIENT ====================

export const ddApi = {
  // Checklist management
  getChecklist: (dealId) =>
    requestJson(`/deals/${dealId}/dd-checklist`),

  initializeChecklist: (dealId, payload) =>
    requestJson(`/deals/${dealId}/dd-checklist/initialize`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getStatus: (dealId) =>
    requestJson(`/deals/${dealId}/dd-checklist/status`),

  getItems: (dealId, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.dealState) params.set('dealState', filters.dealState);
    if (filters.category) params.set('category', filters.category);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    const query = params.toString();
    return requestJson(`/deals/${dealId}/dd-checklist/items${query ? `?${query}` : ''}`);
  },

  // Item management
  getItem: (dealId, itemId) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}`),

  updateItem: (dealId, itemId, { status, notes }) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    }),

  assignItem: (dealId, itemId, { assigneeUserId, assigneeName }) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeUserId, assigneeName }),
    }),

  linkDocument: (dealId, itemId, documentId) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}/link-document`, {
      method: 'POST',
      body: JSON.stringify({ documentId }),
    }),

  verifyItem: (dealId, itemId, notes = null) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  markNA: (dealId, itemId, reason) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}/mark-na`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  addCustomItem: (dealId, payload) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/custom`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getItemHistory: (dealId, itemId) =>
    requestJson(`/deals/${dealId}/dd-checklist/items/${itemId}/history`),

  // AI features
  getSuggestions: (dealId, limit = 5) =>
    requestJson(`/deals/${dealId}/dd-checklist/suggestions?limit=${limit}`),

  getRisks: (dealId) =>
    requestJson(`/deals/${dealId}/dd-checklist/risks`),

  getSummary: (dealId, audience = 'internal') =>
    requestJson(`/deals/${dealId}/dd-checklist/summary?audience=${audience}`),

  processDocument: (dealId, documentId, options = {}) =>
    requestJson(`/deals/${dealId}/dd-checklist/process-document`, {
      method: 'POST',
      body: JSON.stringify({ documentId, options }),
    }),

  getPendingApprovals: (dealId) =>
    requestJson(`/deals/${dealId}/dd-checklist/pending-approvals`),

  approveMatch: (dealId, approvalId, payload = {}) =>
    requestJson(`/deals/${dealId}/dd-checklist/approvals/${approvalId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  rejectMatch: (dealId, approvalId, reason) =>
    requestJson(`/deals/${dealId}/dd-checklist/approvals/${approvalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Templates (admin)
  getTemplates: () =>
    requestJson('/admin/dd-templates'),

  getCategories: () =>
    requestJson('/admin/dd-templates/categories'),
};

// ==================== QUERY HOOKS ====================

/**
 * Get DD checklist for a deal
 */
export function useChecklist(dealId, options = {}) {
  return useQuery({
    queryKey: ddKeys.checklist(dealId),
    queryFn: () => ddApi.getChecklist(dealId),
    enabled: !!dealId,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Get DD completion status summary
 */
export function useChecklistStatus(dealId, options = {}) {
  return useQuery({
    queryKey: ddKeys.status(dealId),
    queryFn: () => ddApi.getStatus(dealId),
    enabled: !!dealId,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Get DD items with filtering
 */
export function useChecklistItems(dealId, filters = {}, options = {}) {
  return useQuery({
    queryKey: ddKeys.items(dealId, filters),
    queryFn: () => ddApi.getItems(dealId, filters),
    enabled: !!dealId,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Get single DD item with history
 */
export function useItem(dealId, itemId, options = {}) {
  return useQuery({
    queryKey: ddKeys.item(itemId),
    queryFn: () => ddApi.getItem(dealId, itemId),
    enabled: !!dealId && !!itemId,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Get item history
 */
export function useItemHistory(dealId, itemId, options = {}) {
  return useQuery({
    queryKey: ddKeys.itemHistory(itemId),
    queryFn: () => ddApi.getItemHistory(dealId, itemId),
    enabled: !!dealId && !!itemId,
    ...options,
  });
}

/**
 * Get AI suggestions for next items
 */
export function useSuggestions(dealId, limit = 5, options = {}) {
  return useQuery({
    queryKey: ddKeys.suggestions(dealId),
    queryFn: () => ddApi.getSuggestions(dealId, limit),
    enabled: !!dealId,
    staleTime: 60000,
    ...options,
  });
}

/**
 * Get risk detection results
 */
export function useRisks(dealId, options = {}) {
  return useQuery({
    queryKey: ddKeys.risks(dealId),
    queryFn: () => ddApi.getRisks(dealId),
    enabled: !!dealId,
    staleTime: 60000,
    ...options,
  });
}

/**
 * Get DD status summary
 */
export function useSummary(dealId, audience = 'internal', options = {}) {
  return useQuery({
    queryKey: ddKeys.summary(dealId, audience),
    queryFn: () => ddApi.getSummary(dealId, audience),
    enabled: !!dealId,
    staleTime: 60000,
    ...options,
  });
}

/**
 * Get pending document approvals
 */
export function usePendingApprovals(dealId, options = {}) {
  return useQuery({
    queryKey: ddKeys.pendingApprovals(dealId),
    queryFn: () => ddApi.getPendingApprovals(dealId),
    enabled: !!dealId,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Get DD templates (admin)
 */
export function useTemplates(options = {}) {
  return useQuery({
    queryKey: ddKeys.templates(),
    queryFn: () => ddApi.getTemplates(),
    staleTime: 300000, // 5 minutes - templates rarely change
    ...options,
  });
}

/**
 * Get DD categories
 */
export function useCategories(options = {}) {
  return useQuery({
    queryKey: ddKeys.categories(),
    queryFn: () => ddApi.getCategories(),
    staleTime: 300000,
    ...options,
  });
}

// ==================== MUTATION HOOKS ====================

/**
 * Initialize DD checklist for a deal
 */
export function useInitializeChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, payload }) => ddApi.initializeChecklist(dealId, payload),
    onSuccess: (data, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.status(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Update item status
 */
export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, itemId, status, notes }) =>
      ddApi.updateItem(dealId, itemId, { status, notes }),
    onSuccess: (data, { dealId, itemId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.status(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
      queryClient.invalidateQueries({ queryKey: ddKeys.suggestions(dealId) });
    },
  });
}

/**
 * Assign item to user
 */
export function useAssignItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, itemId, assigneeUserId, assigneeName }) =>
      ddApi.assignItem(dealId, itemId, { assigneeUserId, assigneeName }),
    onSuccess: (data, { dealId, itemId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Link document to item
 */
export function useLinkDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, itemId, documentId }) =>
      ddApi.linkDocument(dealId, itemId, documentId),
    onSuccess: (data, { dealId, itemId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Verify item
 */
export function useVerifyItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, itemId, notes }) =>
      ddApi.verifyItem(dealId, itemId, notes),
    onSuccess: (data, { dealId, itemId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.status(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Mark item as N/A
 */
export function useMarkNA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, itemId, reason }) =>
      ddApi.markNA(dealId, itemId, reason),
    onSuccess: (data, { dealId, itemId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.item(itemId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.status(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Add custom item
 */
export function useAddCustomItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, payload }) =>
      ddApi.addCustomItem(dealId, payload),
    onSuccess: (data, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.status(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Process document with AI
 */
export function useProcessDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, documentId, options }) =>
      ddApi.processDocument(dealId, documentId, options),
    onSuccess: (data, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.pendingApprovals(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Approve document match
 */
export function useApproveMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, approvalId, payload }) =>
      ddApi.approveMatch(dealId, approvalId, payload),
    onSuccess: (data, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.pendingApprovals(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.checklist(dealId) });
      queryClient.invalidateQueries({ queryKey: ddKeys.items(dealId, {}) });
    },
  });
}

/**
 * Reject document match
 */
export function useRejectMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, approvalId, reason }) =>
      ddApi.rejectMatch(dealId, approvalId, reason),
    onSuccess: (data, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ddKeys.pendingApprovals(dealId) });
    },
  });
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Calculate progress percentage from status counts
 */
export function calculateProgress(status) {
  if (!status) return 0;
  const { total, completed, notApplicable } = status;
  if (!total || total === 0) return 0;
  const applicable = total - (notApplicable || 0);
  if (applicable === 0) return 100;
  return Math.round((completed / applicable) * 100);
}

/**
 * Get status color class
 */
export function getStatusColor(status) {
  const colors = {
    NOT_STARTED: 'bg-gray-100 text-gray-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    WAITING: 'bg-amber-100 text-amber-700',
    BLOCKED: 'bg-red-100 text-red-700',
    COMPLETE: 'bg-green-100 text-green-700',
    'N/A': 'bg-slate-100 text-slate-500',
  };
  return colors[status] || colors.NOT_STARTED;
}

/**
 * Get status icon name
 */
export function getStatusIcon(status) {
  const icons = {
    NOT_STARTED: 'Circle',
    IN_PROGRESS: 'Clock',
    WAITING: 'Pause',
    BLOCKED: 'AlertTriangle',
    COMPLETE: 'CheckCircle2',
    'N/A': 'MinusCircle',
  };
  return icons[status] || icons.NOT_STARTED;
}

/**
 * Get priority badge variant
 */
export function getPriorityVariant(priority) {
  const variants = {
    CRITICAL: 'destructive',
    HIGH: 'default',
    MEDIUM: 'secondary',
    LOW: 'outline',
  };
  return variants[priority] || variants.MEDIUM;
}

/**
 * Format due date with urgency
 */
export function formatDueDate(dueDate) {
  if (!dueDate) return null;

  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, urgent: true };
  } else if (diffDays === 0) {
    return { text: 'Due today', urgent: true };
  } else if (diffDays === 1) {
    return { text: 'Due tomorrow', urgent: false };
  } else if (diffDays <= 7) {
    return { text: `Due in ${diffDays}d`, urgent: false };
  } else {
    return { text: due.toLocaleDateString(), urgent: false };
  }
}

/**
 * Group items by category
 */
export function groupByCategory(items, categories) {
  if (!items || !categories) return [];

  const grouped = new Map();

  // Initialize all categories
  categories.forEach(cat => {
    grouped.set(cat.code, {
      ...cat,
      items: [],
      stats: { total: 0, completed: 0, blocked: 0, overdue: 0 },
    });
  });

  // Group items
  const now = new Date();
  items.forEach(item => {
    const category = grouped.get(item.categoryCode);
    if (category) {
      category.items.push(item);
      category.stats.total++;
      if (item.status === 'COMPLETE') category.stats.completed++;
      if (item.status === 'BLOCKED') category.stats.blocked++;
      if (item.dueDate && new Date(item.dueDate) < now && item.status !== 'COMPLETE') {
        category.stats.overdue++;
      }
    }
  });

  return Array.from(grouped.values()).filter(cat => cat.items.length > 0);
}
