import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { bff } from "@/api/bffClient";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  MessageSquare,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  FileCheck,
  Eye,
  RefreshCw
} from "lucide-react";

/**
 * Format currency
 */
function formatCurrency(value) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Format date relative
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Summary Card component
 */
function SummaryCard({ title, value, icon: Icon, trend, description, variant = "default" }) {
  const bgColors = {
    default: "bg-white",
    primary: "bg-blue-50",
    warning: "bg-amber-50",
    success: "bg-green-50"
  };

  const iconColors = {
    default: "text-slate-600",
    primary: "text-blue-600",
    warning: "text-amber-600",
    success: "text-green-600"
  };

  return (
    <Card className={bgColors[variant]}>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-600">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {description && (
              <p className="text-sm text-slate-500 mt-1">{description}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${bgColors[variant] === "bg-white" ? "bg-slate-100" : "bg-white/50"}`}>
            <Icon className={`h-5 w-5 ${iconColors[variant]}`} />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Funnel Bar component
 */
function FunnelBar({ data }) {
  const stages = [
    { key: "distributed", label: "Distributed", color: "bg-slate-200" },
    { key: "views", label: "Viewed", color: "bg-blue-200" },
    { key: "interested", label: "Interested", color: "bg-blue-400" },
    { key: "ndaSent", label: "NDA Sent", color: "bg-blue-500" },
    { key: "ndaSigned", label: "NDA Signed", color: "bg-blue-600" },
    { key: "inDataRoom", label: "In DD", color: "bg-green-500" }
  ];

  const maxValue = Math.max(...stages.map(s => data[s.key] || 0), 1);

  return (
    <div className="space-y-3">
      {stages.map(stage => {
        const value = data[stage.key] || 0;
        const percentage = (value / maxValue) * 100;

        return (
          <div key={stage.key} className="flex items-center gap-3">
            <span className="text-sm text-slate-600 w-24">{stage.label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full ${stage.color} transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-sm font-medium w-8 text-right">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Activity Item component
 */
function ActivityItem({ activity }) {
  const typeIcons = {
    buyer_interested: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-100" },
    buyer_interested_conditions: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-100" },
    buyer_passed: { icon: AlertCircle, color: "text-slate-400", bg: "bg-slate-100" },
    nda_signed: { icon: FileCheck, color: "text-blue-500", bg: "bg-blue-100" }
  };

  const typeConfig = typeIcons[activity.type] || typeIcons.buyer_interested;
  const Icon = typeConfig.icon;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`p-2 rounded-full ${typeConfig.bg}`}>
        <Icon className={`h-4 w-4 ${typeConfig.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900">{activity.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-500">{formatRelativeTime(activity.timestamp)}</span>
          {activity.hasQuestions && (
            <Badge variant="outline" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              Has questions
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Listing Card component
 */
function ListingCard({ listing, onClick }) {
  const priceDisplay = listing.askingPrice
    ? formatCurrency(listing.askingPrice)
    : listing.priceMin && listing.priceMax
    ? `${formatCurrency(listing.priceMin)} - ${formatCurrency(listing.priceMax)}`
    : "Price TBD";

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">
              {listing.propertyName || "Unnamed Property"}
            </h3>
            <p className="text-sm text-slate-500 truncate mt-1">
              {listing.propertyAddress || "No address"}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{listing.assetType || "Unknown"}</Badge>
              <span className="text-sm font-medium">{priceDisplay}</span>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
        </div>

        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-100">
          <div className="text-center">
            <p className="text-lg font-semibold">{listing.funnel?.views || 0}</p>
            <p className="text-xs text-slate-500">Views</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{listing.funnel?.interested || 0}</p>
            <p className="text-xs text-slate-500">Interested</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-amber-600">
              {listing.pendingQuestions || 0}
            </p>
            <p className="text-xs text-slate-500">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{listing.daysOnMarket || 0}</p>
            <p className="text-xs text-slate-500">DOM</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-sm text-slate-500">Est. Commission</span>
          <span className="text-sm font-semibold text-green-600">
            {formatCurrency(listing.commissionProjected)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty State component
 */
function EmptyState() {
  return (
    <div className="text-center py-12">
      <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-slate-900">No Active Listings</h3>
      <p className="text-slate-500 mt-2 max-w-md mx-auto">
        You don't have any active listings yet. Accept a listing invitation to get started.
      </p>
    </div>
  );
}

/**
 * Loading Skeleton
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * BrokerDashboard Page
 * Unified dashboard showing all active listings with aggregated stats
 */
export default function BrokerDashboard() {
  const navigate = useNavigate();
  const lastCheckRef = useRef(new Date().toISOString());

  console.log("[BrokerDashboard] Rendering");

  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["broker-dashboard"],
    queryFn: () => bff.broker.getDashboard(),
    refetchInterval: 60000 // Refresh every minute
  });

  // Fetch activity timeline
  const { data: activityData } = useQuery({
    queryKey: ["broker-activity"],
    queryFn: () => bff.broker.getActivity({ limit: 10 }),
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Log dashboard load
  useEffect(() => {
    if (dashboardData) {
      console.log("[BrokerDashboard] Data loaded", {
        listings: dashboardData.listings?.length,
        pendingInquiries: dashboardData.summary?.pendingInquiries
      });
    }
  }, [dashboardData]);

  const handleListingClick = (listing) => {
    console.log("[BrokerDashboard] Listing clicked", { dealDraftId: listing.id });
    navigate(createPageUrl(`BrokerDealView?invitationId=${listing.invitationId}`));
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Broker Dashboard</h1>
        <DashboardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Broker Dashboard</h1>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-900">Failed to load dashboard</p>
                <p className="text-sm text-red-700">{error?.message || "Please try again"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-auto">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, listings, aggregateFunnel } = dashboardData || {};
  const activities = activityData?.activities || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Broker Dashboard</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Active Listings"
          value={summary?.totalActiveListings || 0}
          icon={Building2}
          variant="primary"
        />
        <SummaryCard
          title="Pending Inquiries"
          value={summary?.pendingInquiries || 0}
          icon={MessageSquare}
          variant={summary?.pendingInquiries > 0 ? "warning" : "default"}
          description={summary?.pendingInquiries > 0 ? "Awaiting your response" : "All caught up"}
        />
        <SummaryCard
          title="Buyers in DD"
          value={summary?.buyersInDD || 0}
          icon={Users}
          variant="success"
        />
        <SummaryCard
          title="Projected Commission"
          value={formatCurrency(summary?.projectedCommission || 0)}
          icon={DollarSign}
          variant="default"
        />
      </div>

      {listings?.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funnel Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5 text-slate-500" />
                Buyer Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aggregateFunnel && <FunnelBar data={aggregateFunnel} />}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  {activities.map((activity, idx) => (
                    <ActivityItem key={idx} activity={activity} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  No recent activity
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-slate-500" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Total Views</span>
                  <span className="font-semibold">{aggregateFunnel?.views || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Conversion Rate</span>
                  <span className="font-semibold">
                    {aggregateFunnel?.views > 0
                      ? `${Math.round((aggregateFunnel.interested / aggregateFunnel.views) * 100)}%`
                      : "0%"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">NDA Completion</span>
                  <span className="font-semibold">
                    {aggregateFunnel?.ndaSent > 0
                      ? `${Math.round((aggregateFunnel.ndaSigned / aggregateFunnel.ndaSent) * 100)}%`
                      : "0%"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Avg. Days on Market</span>
                  <span className="font-semibold">
                    {listings?.length > 0
                      ? Math.round(listings.reduce((sum, l) => sum + (l.daysOnMarket || 0), 0) / listings.length)
                      : 0}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Listings Grid */}
      {listings?.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">Your Listings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onClick={() => handleListingClick(listing)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
