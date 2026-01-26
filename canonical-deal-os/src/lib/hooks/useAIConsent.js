import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api';

function getAuthToken() {
  return localStorage.getItem('auth_token');
}

async function fetchConsentStatus() {
  const authToken = getAuthToken();
  const response = await fetch(`${API_BASE}/ai-consent/status`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch consent status');
  }

  return response.json();
}

async function grantConsentRequest(features = {}) {
  const authToken = getAuthToken();
  const response = await fetch(`${API_BASE}/ai-consent/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(features)
  });

  if (!response.ok) {
    throw new Error('Failed to grant consent');
  }

  return response.json();
}

/**
 * Hook for managing AI consent status and granting consent.
 *
 * @returns {Object} Consent state and actions
 * @property {boolean} hasConsent - Whether the user has granted AI consent
 * @property {Object} features - Individual feature consent states
 * @property {boolean} isLoading - Whether consent status is loading
 * @property {Function} grantConsent - Function to grant consent
 * @property {boolean} isGranting - Whether consent grant is in progress
 * @property {Function} refetch - Refetch consent status
 */
export function useAIConsent() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['ai-consent-status'],
    queryFn: fetchConsentStatus,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false // Don't retry on failure (user may not have consent table yet)
  });

  const grantMutation = useMutation({
    mutationFn: grantConsentRequest,
    onSuccess: () => {
      // Invalidate consent status to refetch
      queryClient.invalidateQueries({ queryKey: ['ai-consent-status'] });
      // Also invalidate any queries that depend on consent (like insights)
      queryClient.invalidateQueries({ queryKey: ['deal-insights'] });
    }
  });

  return {
    hasConsent: statusQuery.data?.hasConsent ?? false,
    features: statusQuery.data?.features ?? {
      dealParsing: false,
      chatAssistant: false,
      documentAnalysis: false,
      insights: false
    },
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
    grantConsent: grantMutation.mutateAsync,
    isGranting: grantMutation.isPending,
    refetch: statusQuery.refetch
  };
}
