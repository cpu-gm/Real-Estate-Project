import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bff } from "@/api/bffClient";
import { debugLog } from "@/lib/debug";
import { toast } from "@/components/ui/use-toast";
import { PageError } from "@/components/ui/page-state";
import { createPageUrl } from "@/utils";
import { Trophy } from "lucide-react";

export default function DealProgress() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealDraftId = searchParams.get("dealDraftId");
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [winningBuyerUserId, setWinningBuyerUserId] = useState("");
  const [conversionNotes, setConversionNotes] = useState("");

  const progressQuery = useQuery({
    queryKey: ["dealProgress", dealDraftId],
    queryFn: () => bff.gate.getProgress(dealDraftId),
    enabled: !!dealDraftId,
    onError: (error) => {
      debugLog("gate", "Progress load failed", { dealDraftId, message: error?.message });
    }
  });

  const advanceMutation = useMutation({
    mutationFn: () => bff.gate.advanceToActiveDD(dealDraftId),
    onSuccess: () => {
      debugLog("gate", "Advanced to ACTIVE_DD", { dealDraftId });
      queryClient.invalidateQueries(["dealProgress", dealDraftId]);
      toast({ title: "Deal advanced to Active DD" });
    },
    onError: (error) => {
      toast({ title: "Advance failed", description: error.message, variant: "destructive" });
    }
  });

  const convertMutation = useMutation({
    mutationFn: () => bff.dealIntake.convertToDeal(dealDraftId, winningBuyerUserId, conversionNotes || null),
    onSuccess: (data) => {
      debugLog("gate", "Deal converted", { dealDraftId, kernelDealId: data.kernelDealId });
      toast({ title: "Deal converted successfully!" });
      // Navigate to the new kernel deal
      if (data.kernelDealId) {
        navigate(createPageUrl(`DealOverview?id=${data.kernelDealId}`));
      }
    },
    onError: (error) => {
      toast({ title: "Conversion failed", description: error.message, variant: "destructive" });
    }
  });

  // Fetch authorized buyers for the dropdown
  const queueQuery = useQuery({
    queryKey: ["gateQueue", dealDraftId],
    queryFn: () => bff.gate.getQueue(dealDraftId),
    enabled: !!dealDraftId && showConvertForm
  });

  const authorizedBuyers = (queueQuery.data || []).filter(
    (item) => item.authorization?.status === "AUTHORIZED" && item.authorization?.ndaStatus === "SIGNED"
  );

  if (!dealDraftId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Missing dealDraftId.</CardContent>
        </Card>
      </div>
    );
  }

  if (progressQuery.error) {
    return (
      <div className="p-6">
        <PageError error={progressQuery.error} onRetry={progressQuery.refetch} />
      </div>
    );
  }

  const progress = progressQuery.data;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Deal Progress</h1>

      {!progress ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Loading progress...</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge variant="outline">{progress.dealStatus}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funnel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="outline">Distributed {progress.funnel.distributed}</Badge>
              <Badge variant="outline">Responded {progress.funnel.responded}</Badge>
              <Badge variant="outline">Interested {progress.funnel.interested}</Badge>
              <Badge variant="outline">Authorized {progress.funnel.authorized}</Badge>
              <Badge variant="outline">NDA Signed {progress.funnel.ndaSigned}</Badge>
              <Badge variant="outline">In Data Room {progress.funnel.inDataRoom}</Badge>
            </CardContent>
          </Card>

          {progress.canAdvanceToDD && (
            <Button onClick={() => advanceMutation.mutate()} disabled={advanceMutation.isPending}>
              {advanceMutation.isPending ? "Advancing..." : "Advance to Active DD"}
            </Button>
          )}

          {/* Deal Conversion Section */}
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-green-600" />
                Close Deal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showConvertForm ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    When a buyer wins, convert this intake draft to a kernel deal.
                    The winning buyer will become the GP of the new deal.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setShowConvertForm(true)}
                  >
                    Select Winning Buyer
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Winning Buyer User ID</Label>
                    <Input
                      value={winningBuyerUserId}
                      onChange={(e) => setWinningBuyerUserId(e.target.value)}
                      placeholder="Enter buyer user ID"
                    />
                    {authorizedBuyers.length > 0 && (
                      <div className="text-xs text-gray-500">
                        <p className="font-medium mb-1">Qualified buyers (NDA signed):</p>
                        {authorizedBuyers.map((item) => (
                          <button
                            key={item.response?.buyerUserId}
                            type="button"
                            className="block w-full text-left p-2 hover:bg-gray-100 rounded"
                            onClick={() => setWinningBuyerUserId(item.response?.buyerUserId || "")}
                          >
                            {item.buyer?.firmName || item.buyer?.name || item.response?.buyerUserId}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      value={conversionNotes}
                      onChange={(e) => setConversionNotes(e.target.value)}
                      placeholder="Add any notes about the deal closure..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowConvertForm(false);
                        setWinningBuyerUserId("");
                        setConversionNotes("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => convertMutation.mutate()}
                      disabled={!winningBuyerUserId || convertMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {convertMutation.isPending ? "Converting..." : "Convert to Deal"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
