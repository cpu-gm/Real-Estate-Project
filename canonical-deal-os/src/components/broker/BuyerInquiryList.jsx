import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bff } from "@/api/bffClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Clock,
  CheckCircle,
  FileCheck,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import BuyerInquiryCard from "./BuyerInquiryCard";

/**
 * Filter tabs for inquiry list
 */
const FILTER_TABS = [
  { id: "all", label: "All", icon: Users },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "authorized", label: "Authorized", icon: CheckCircle },
  { id: "nda_signed", label: "NDA Signed", icon: FileCheck }
];

/**
 * Empty state component
 */
function EmptyState({ filter }) {
  const messages = {
    all: "No interested buyers yet. Once buyers express interest, they'll appear here.",
    pending: "No pending inquiries. All buyer inquiries have been addressed.",
    authorized: "No authorized buyers yet. Authorize interested buyers to give them access.",
    nda_signed: "No buyers have signed NDAs yet."
  };

  return (
    <div className="text-center py-8">
      <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500">{messages[filter]}</p>
    </div>
  );
}

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
            <div className="flex gap-2 mt-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * BuyerInquiryList Component
 * Displays list of buyer inquiries with filtering
 */
export default function BuyerInquiryList({
  dealDraftId,
  onReply
}) {
  const [filter, setFilter] = useState("all");

  console.log("[BuyerInquiryList] Rendering", { dealDraftId, filter });

  // Fetch inquiries
  const {
    data: inquiriesData,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["broker-listing-inquiries", dealDraftId],
    queryFn: () => bff.broker.getListingInquiries(dealDraftId),
    enabled: !!dealDraftId
  });

  const inquiries = inquiriesData?.inquiries || [];

  // Filter inquiries based on selected tab
  const filteredInquiries = inquiries.filter((inquiry) => {
    switch (filter) {
      case "pending":
        return !inquiry.authorization || inquiry.authorization.status === "PENDING";
      case "authorized":
        return inquiry.authorization?.status === "AUTHORIZED";
      case "nda_signed":
        return inquiry.authorization?.ndaStatus === "SIGNED";
      default:
        return true;
    }
  });

  // Count for each filter
  const counts = {
    all: inquiries.length,
    pending: inquiries.filter(
      (i) => !i.authorization || i.authorization.status === "PENDING"
    ).length,
    authorized: inquiries.filter(
      (i) => i.authorization?.status === "AUTHORIZED"
    ).length,
    nda_signed: inquiries.filter(
      (i) => i.authorization?.ndaStatus === "SIGNED"
    ).length
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-900">Failed to load inquiries</p>
              <p className="text-sm text-red-700">{error?.message || "Please try again"}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" />
          Buyer Inquiries
          <span className="text-sm font-normal text-slate-500">
            ({inquiries.length} total)
          </span>
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="grid w-full grid-cols-4">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {counts[tab.id] > 0 && (
                  <span className="ml-1 bg-slate-200 text-slate-700 text-xs px-1.5 py-0.5 rounded-full">
                    {counts[tab.id]}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab content */}
        {FILTER_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {filter === tab.id && (
              <>
                {filteredInquiries.length === 0 ? (
                  <EmptyState filter={filter} />
                ) : (
                  <div className="space-y-4">
                    {filteredInquiries.map((inquiry) => (
                      <BuyerInquiryCard
                        key={inquiry.buyerUserId}
                        inquiry={inquiry}
                        dealDraftId={dealDraftId}
                        onReply={onReply}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
