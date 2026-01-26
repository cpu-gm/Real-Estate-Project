import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/api/bffClient";
import { debugLog } from "@/lib/debug";
import { toast } from "@/components/ui/use-toast";
import { PageError } from "@/components/ui/page-state";
import { createPageUrl } from "@/utils";

const LISTING_TYPES = ["PRIVATE", "PUBLIC"];

export default function DistributionManagement() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealDraftId = searchParams.get("dealDraftId");
  const [listingType, setListingType] = useState("PRIVATE");
  const [recipientIds, setRecipientIds] = useState("");
  const [recipientEmails, setRecipientEmails] = useState("");
  const [selectedDistributionId, setSelectedDistributionId] = useState(null);

  const distributionsQuery = useQuery({
    queryKey: ["distributions", dealDraftId],
    queryFn: () => bff.distribution.getForDeal(dealDraftId),
    enabled: !!dealDraftId,
    onError: (error) => {
      debugLog("distribution", "Distributions load failed", {
        dealDraftId,
        message: error?.message
      });
    }
  });

  const createMutation = useMutation({
    mutationFn: (payload) => bff.distribution.create(dealDraftId, payload),
    onSuccess: (data) => {
      debugLog("distribution", "Distribution created", { dealDraftId });
      queryClient.invalidateQueries(["distributions", dealDraftId]);
      toast({ title: "Distribution created" });
      setRecipientIds("");
      // Auto-select the newly created distribution
      if (data?.distribution?.id) {
        setSelectedDistributionId(data.distribution.id);
      }
    },
    onError: (error) => {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
    }
  });

  const addByEmailMutation = useMutation({
    mutationFn: ({ distributionId, emails }) => bff.distribution.addByEmail(distributionId, emails),
    onSuccess: (data) => {
      debugLog("distribution", "Recipients added by email", { added: data.added?.length });
      queryClient.invalidateQueries(["distributions", dealDraftId]);
      const addedCount = data.added?.length || 0;
      const errorCount = data.errors?.length || 0;
      if (addedCount > 0) {
        toast({ title: `${addedCount} recipient(s) added` });
      }
      if (errorCount > 0) {
        toast({
          title: `${errorCount} email(s) had issues`,
          description: data.errors.map(e => `${e.email}: ${e.error}`).join(", "),
          variant: "destructive"
        });
      }
      setRecipientEmails("");
    },
    onError: (error) => {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
    }
  });

  if (!dealDraftId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Missing dealDraftId.</CardContent>
        </Card>
      </div>
    );
  }

  if (distributionsQuery.error) {
    return (
      <div className="p-6">
        <PageError error={distributionsQuery.error} onRetry={distributionsQuery.refetch} />
      </div>
    );
  }

  const handleCreate = () => {
    const ids = recipientIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    createMutation.mutate({
      listingType,
      recipientIds: ids
    });
  };

  const handleAddByEmail = () => {
    if (!selectedDistributionId) {
      toast({ title: "Select a distribution first", variant: "destructive" });
      return;
    }
    const emails = recipientEmails
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      toast({ title: "Enter at least one email", variant: "destructive" });
      return;
    }

    addByEmailMutation.mutate({
      distributionId: selectedDistributionId,
      emails
    });
  };

  const distributions = distributionsQuery.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Distribution Management</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Listing type</Label>
            <Select value={listingType} onValueChange={setListingType}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select listing type" />
              </SelectTrigger>
              <SelectContent>
                {LISTING_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Recipient IDs (comma separated)</Label>
            <Input
              value={recipientIds}
              onChange={(event) => setRecipientIds(event.target.value)}
              placeholder="buyer-1,buyer-2"
            />
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Distribution"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(createPageUrl(`DealDraftDetail?id=${dealDraftId}`))}>
            Back to Deal Draft
          </Button>
          <Button variant="outline" onClick={() => navigate(createPageUrl(`BuyerReviewQueue?dealDraftId=${dealDraftId}`))}>
            Review Buyer Responses
          </Button>
          <Button variant="outline" onClick={() => navigate(createPageUrl(`DealProgress?dealDraftId=${dealDraftId}`))}>
            View Progress
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing distributions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {distributions.length === 0 ? (
            <div className="text-sm text-gray-500">No distributions yet.</div>
          ) : (
            distributions.map((distribution) => (
              <div
                key={distribution.id}
                className={`flex items-center justify-between text-sm p-2 rounded cursor-pointer transition-colors ${
                  selectedDistributionId === distribution.id
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-gray-50"
                }`}
                onClick={() => setSelectedDistributionId(distribution.id)}
              >
                <div>
                  <div className="font-medium">Distribution {distribution.id.slice(0, 8)}</div>
                  <div className="text-xs text-gray-500">
                    {distribution.recipients?.length || 0} recipients
                  </div>
                </div>
                <Badge variant="outline">{distribution.listingType}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {selectedDistributionId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add recipients by email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Email addresses (comma separated)</Label>
              <Input
                value={recipientEmails}
                onChange={(event) => setRecipientEmails(event.target.value)}
                placeholder="buyer1@example.com, buyer2@example.com"
              />
            </div>
            <Button onClick={handleAddByEmail} disabled={addByEmailMutation.isPending}>
              {addByEmailMutation.isPending ? "Adding..." : "Add Recipients"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
