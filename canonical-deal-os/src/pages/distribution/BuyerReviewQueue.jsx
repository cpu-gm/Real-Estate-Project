import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuyerResponseCard } from "@/components/distribution/BuyerResponseCard";
import { useIntakeAccessRequests } from "@/lib/hooks/useIntakeAccessRequests";
import { bff } from "@/api/bffClient";
import { debugLog } from "@/lib/debug";
import { toast } from "@/components/ui/use-toast";
import { PageError } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { SelectableCard, BulkActionBar, BulkProgressModal } from "@/components/bulk";
import { createLogger } from "@/lib/debug-logger";
import { CheckCircle2, XCircle } from "lucide-react";
import toastHot from "react-hot-toast";

const logger = createLogger('ui:bulk-ops');

export default function BuyerReviewQueue() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealDraftId = searchParams.get("dealDraftId");

  const {
    queue,
    funnelStats,
    isLoading,
    error,
    refetch,
    authorizeMutation,
    declineMutation
  } = useIntakeAccessRequests(dealDraftId);

  // Bulk selection state
  const {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    clearSelection,
    selectionCount
  } = useBulkSelection();

  // Bulk progress modal state
  const [bulkProgress, setBulkProgress] = useState(null);

  const sendNDAMutation = useMutation({
    mutationFn: ({ buyerUserId }) => bff.gate.sendNDA(dealDraftId, buyerUserId),
    onSuccess: () => {
      toast({ title: "NDA sent" });
    },
    onError: (error) => {
      debugLog("gate", "Send NDA failed", { dealDraftId, message: error?.message });
      toast({ title: "NDA failed", description: error.message, variant: "destructive" });
    }
  });

  // Bulk authorize mutation
  const bulkAuthorizeMutation = useMutation({
    mutationFn: async (buyerUserIds) => {
      logger.debug('Bulk authorize started', { action: 'authorize', itemCount: buyerUserIds.length, itemIds: buyerUserIds });
      setBulkProgress({
        total: buyerUserIds.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        isComplete: false
      });

      const result = await bff.gate.bulkAuthorize(dealDraftId, buyerUserIds);

      setBulkProgress({
        total: buyerUserIds.length,
        completed: buyerUserIds.length,
        succeeded: result.succeeded?.length || 0,
        failed: result.failed?.length || 0,
        errors: result.failed || [],
        isComplete: true
      });

      logger.debug('Bulk authorize complete', {
        action: 'authorize',
        successCount: result.succeeded?.length || 0,
        failCount: result.failed?.length || 0
      });

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['gate-review-queue', dealDraftId] });
      if (result.succeeded?.length > 0) {
        toastHot.success(`Authorized ${result.succeeded.length} buyer(s)`);
      }
      if (result.failed?.length > 0) {
        toastHot.error(`Failed to authorize ${result.failed.length} buyer(s)`);
      }
      clearSelection();
    },
    onError: (error) => {
      logger.error('Bulk authorize failed', { error: error.message });
      toastHot.error('Failed to authorize buyers');
      setBulkProgress(prev => prev ? { ...prev, isComplete: true } : null);
    }
  });

  // Bulk decline mutation
  const bulkDeclineMutation = useMutation({
    mutationFn: async (buyerUserIds) => {
      logger.debug('Bulk decline started', { action: 'decline', itemCount: buyerUserIds.length, itemIds: buyerUserIds });
      setBulkProgress({
        total: buyerUserIds.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        isComplete: false
      });

      const result = await bff.gate.bulkDecline(dealDraftId, buyerUserIds, 'Not a fit');

      setBulkProgress({
        total: buyerUserIds.length,
        completed: buyerUserIds.length,
        succeeded: result.succeeded?.length || 0,
        failed: result.failed?.length || 0,
        errors: result.failed || [],
        isComplete: true
      });

      logger.debug('Bulk decline complete', {
        action: 'decline',
        successCount: result.succeeded?.length || 0,
        failCount: result.failed?.length || 0
      });

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['gate-review-queue', dealDraftId] });
      if (result.succeeded?.length > 0) {
        toastHot.success(`Declined ${result.succeeded.length} buyer(s)`);
      }
      if (result.failed?.length > 0) {
        toastHot.error(`Failed to decline ${result.failed.length} buyer(s)`);
      }
      clearSelection();
    },
    onError: (error) => {
      logger.error('Bulk decline failed', { error: error.message });
      toastHot.error('Failed to decline buyers');
      setBulkProgress(prev => prev ? { ...prev, isComplete: true } : null);
    }
  });

  // Handle bulk authorize action
  function handleBulkAuthorize() {
    logger.debug('Bulk authorize initiated', { selectedIds: [...selectedIds], count: selectionCount });
    bulkAuthorizeMutation.mutate([...selectedIds]);
  }

  // Handle bulk decline action
  function handleBulkDecline() {
    logger.debug('Bulk decline initiated', { selectedIds: [...selectedIds], count: selectionCount });
    bulkDeclineMutation.mutate([...selectedIds]);
  }

  if (!dealDraftId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Missing dealDraftId.</CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <PageError error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Buyer Review Queue</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(createPageUrl(`DealDraftDetail?id=${dealDraftId}`))}>
            Back to Deal Draft
          </Button>
          <Button variant="outline" onClick={() => navigate(createPageUrl(`DistributionManagement?dealDraftId=${dealDraftId}`))}>
            Manage Distribution
          </Button>
          <Button variant="outline" onClick={() => navigate(createPageUrl(`DealProgress?dealDraftId=${dealDraftId}`))}>
            View Progress
          </Button>
        </CardContent>
      </Card>

      {funnelStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funnel snapshot</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">Distributed {funnelStats.distributed}</Badge>
            <Badge variant="outline">Responded {funnelStats.responded}</Badge>
            <Badge variant="outline">Interested {funnelStats.interested}</Badge>
            <Badge variant="outline">Authorized {funnelStats.authorized}</Badge>
            <Badge variant="outline">NDA Signed {funnelStats.ndaSigned}</Badge>
            <Badge variant="outline">In Data Room {funnelStats.inDataRoom}</Badge>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Loading queue...</CardContent>
        </Card>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">No buyers awaiting review.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4 pb-20">
          {queue.map((item) => (
            <SelectableCard
              key={item.response.id}
              id={item.response.buyerUserId}
              isSelected={isSelected(item.response.buyerUserId)}
              onToggle={() => toggle(item.response.buyerUserId)}
              testId="buyer-checkbox"
            >
              <BuyerResponseCard
                response={item.response}
                authorization={item.authorization}
                buyer={item.buyer}
                aiScore={item.aiScore}
                onClick={() =>
                  navigate(
                    createPageUrl(
                      `BuyerAuthorizationDetail?dealDraftId=${dealDraftId}&buyerUserId=${item.response.buyerUserId}`
                    )
                  )
                }
                onAuthorize={() =>
                  authorizeMutation.mutate({
                    buyerUserId: item.response.buyerUserId,
                    payload: {}
                  })
                }
                onDecline={() =>
                  declineMutation.mutate({
                    buyerUserId: item.response.buyerUserId,
                    reason: "Not a fit"
                  })
                }
                onSendNDA={() => {
                  debugLog("gate", "Send NDA", { buyerUserId: item.response.buyerUserId });
                  sendNDAMutation.mutate({ buyerUserId: item.response.buyerUserId });
                }}
              />
            </SelectableCard>
          ))}
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selectionCount}
        actions={[
          {
            label: 'Authorize All',
            onClick: handleBulkAuthorize,
            icon: CheckCircle2,
            variant: 'default',
            'data-testid': 'bulk-authorize-button'
          },
          {
            label: 'Decline All',
            onClick: handleBulkDecline,
            icon: XCircle,
            variant: 'destructive',
            'data-testid': 'bulk-decline-button'
          }
        ]}
        onClear={clearSelection}
      />

      {/* Bulk Progress Modal */}
      <BulkProgressModal
        isOpen={!!bulkProgress}
        onClose={() => setBulkProgress(null)}
        progress={bulkProgress}
        title={bulkAuthorizeMutation.isPending ? "Authorizing Buyers" : "Declining Buyers"}
        itemLabel="buyer"
      />
    </div>
  );
}
