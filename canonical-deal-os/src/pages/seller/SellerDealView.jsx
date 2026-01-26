import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/intake/StatusBadge";
import { useIntakeDealOverview } from "@/lib/hooks/useIntakeDealOverview";
import { bff } from "@/api/bffClient";
import { createPageUrl } from "@/utils";
import { debugLog } from "@/lib/debug";
import { PageError } from "@/components/ui/page-state";
import {
  FileText,
  Send,
  Users,
  BarChart3,
  ArrowLeft,
  Eye,
  Building2,
  CheckCircle2,
  Clock
} from "lucide-react";

export default function SellerDealView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealDraftId = searchParams.get("dealDraftId");

  const {
    draft,
    isLoading: draftLoading,
    error: draftError
  } = useIntakeDealOverview(dealDraftId);

  const omQuery = useQuery({
    queryKey: ["omLatest", dealDraftId],
    queryFn: () => bff.om.getLatest(dealDraftId),
    enabled: !!dealDraftId,
    onSuccess: (data) => {
      debugLog("seller", "OM loaded for seller view", { dealDraftId, omId: data?.id });
    }
  });

  const distributionsQuery = useQuery({
    queryKey: ["distributions", dealDraftId],
    queryFn: () => bff.distribution.getForDeal(dealDraftId),
    enabled: !!dealDraftId
  });

  const gateProgressQuery = useQuery({
    queryKey: ["gateProgress", dealDraftId],
    queryFn: () => bff.gate.getProgress(dealDraftId),
    enabled: !!dealDraftId
  });

  if (!dealDraftId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">
            Missing dealDraftId. Please access this page from a deal link.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="p-6">
        <PageError error={draftError} />
      </div>
    );
  }

  if (draftLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const distributions = distributionsQuery.data ?? [];
  const omVersion = omQuery.data;
  const progress = gateProgressQuery.data;

  // Calculate recipient totals
  const totalRecipients = distributions.reduce(
    (sum, dist) => sum + (dist.recipients?.length || 0),
    0
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl("DealDrafts"))}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500">Seller View</span>
            </div>
            <h1 className="text-2xl font-bold">
              {draft?.propertyName || draft?.propertyAddress || "Untitled Deal"}
            </h1>
            {draft?.propertyAddress && (
              <p className="text-sm text-gray-500 mt-1">{draft.propertyAddress}</p>
            )}
          </div>
        </div>
        {draft?.status && <StatusBadge status={draft.status} />}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <FileText className="w-4 h-4" />
              OM Status
            </div>
            <div className="font-semibold">
              {omVersion ? (
                <Badge variant="outline">{omVersion.status}</Badge>
              ) : (
                <span className="text-gray-400">Not generated</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Send className="w-4 h-4" />
              Sent To
            </div>
            <div className="font-semibold">{totalRecipients} buyers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Users className="w-4 h-4" />
              Interested
            </div>
            <div className="font-semibold">{progress?.interested || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <BarChart3 className="w-4 h-4" />
              In Data Room
            </div>
            <div className="font-semibold">{progress?.inDataRoom || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Deal Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Deal Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Asset Type</div>
            <div>{draft?.assetType || "Not set"}</div>
          </div>
          <div>
            <div className="text-gray-500">Asking Price</div>
            <div>
              {draft?.askingPrice
                ? `$${draft.askingPrice.toLocaleString()}`
                : "Not set"}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Units</div>
            <div>{draft?.unitCount || "Not set"}</div>
          </div>
          <div>
            <div className="text-gray-500">Total SF</div>
            <div>{draft?.totalSF || "Not set"}</div>
          </div>
        </CardContent>
      </Card>

      {/* OM Approval Status */}
      {omVersion && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Offering Memorandum
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-sm text-gray-500">Version</div>
                <div className="font-medium">{omVersion.versionNumber}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Status</div>
                <Badge variant="outline">{omVersion.status}</Badge>
              </div>
            </div>

            {/* Approval timeline */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {omVersion.approval?.brokerApprovedAt ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Clock className="w-5 h-5 text-gray-300" />
                )}
                <div>
                  <div className="text-sm font-medium">Broker Approval</div>
                  <div className="text-xs text-gray-500">
                    {omVersion.approval?.brokerApprovedAt
                      ? `Approved ${new Date(omVersion.approval.brokerApprovedAt).toLocaleDateString()}`
                      : "Pending"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {omVersion.approval?.sellerApprovedAt ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Clock className="w-5 h-5 text-gray-300" />
                )}
                <div>
                  <div className="text-sm font-medium">Your Approval</div>
                  <div className="text-xs text-gray-500">
                    {omVersion.approval?.sellerApprovedAt
                      ? `Approved ${new Date(omVersion.approval.sellerApprovedAt).toLocaleDateString()}`
                      : "Awaiting your approval"}
                  </div>
                </div>
              </div>
            </div>

            {omVersion.status === "BROKER_APPROVED" && !omVersion.approval?.sellerApprovedAt && (
              <Button
                onClick={() =>
                  navigate(createPageUrl(`OMEditor?dealDraftId=${dealDraftId}`))
                }
              >
                Review and Approve OM
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Distribution Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            Distribution Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {distributions.length === 0 ? (
            <div className="text-sm text-gray-500">
              No distributions yet. Your broker will distribute the OM to potential buyers.
            </div>
          ) : (
            <div className="space-y-3">
              {distributions.map((dist) => (
                <div
                  key={dist.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm">
                      Distribution {dist.id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {dist.recipients?.length || 0} recipients
                    </div>
                  </div>
                  <Badge variant="outline">{dist.listingType}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Funnel */}
      {progress && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Buyer Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Distributed</span>
                <span className="font-medium">{progress.distributed || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Responded</span>
                <span className="font-medium">{progress.responded || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Interested</span>
                <span className="font-medium text-green-600">{progress.interested || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">NDA Signed</span>
                <span className="font-medium">{progress.ndaSigned || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">In Data Room</span>
                <span className="font-medium text-blue-600">{progress.inDataRoom || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
