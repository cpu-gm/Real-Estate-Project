import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bff } from "@/api/bffClient";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  Check,
  X,
  Clock,
  FileText,
  Users,
  Eye,
  Send,
  Loader2,
  AlertCircle,
  Home
} from "lucide-react";
import BuyerInquiryList from "@/components/broker/BuyerInquiryList";
import { useChatContext } from "@/context/ChatContext";

/**
 * Format a price for display
 */
function formatPrice(price) {
  if (!price) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

/**
 * Format a date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Invitation Action Banner
 * Shows accept/decline buttons for pending invitations
 */
function InvitationActionBanner({ invitation, onAccept, onDecline, isAccepting, isDeclining }) {
  if (!invitation || invitation.status !== 'PENDING') return null;

  return (
    <Card className="border-2 border-amber-500 bg-amber-50">
      <CardContent className="py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-full">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Listing Invitation</h2>
              <p className="text-slate-600 mt-1">
                <span className="font-medium">{invitation.invitedByName || invitation.invitedByEmail}</span> has invited you to represent this property as listing broker.
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Sent {formatDate(invitation.sentAt)} &bull; Expires {formatDate(invitation.expiresAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <Button
              onClick={onAccept}
              disabled={isAccepting || isDeclining}
              className="gap-2"
            >
              {isAccepting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Accept & Start Listing
            </Button>
            <Button
              variant="outline"
              onClick={onDecline}
              disabled={isAccepting || isDeclining}
              className="gap-2"
            >
              {isDeclining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Decline
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Property Overview Card
 * Shows basic property info that broker is allowed to see
 */
function PropertyOverviewCard({ draft, listing }) {
  const priceDisplay = draft?.askingPrice
    ? formatPrice(draft.askingPrice)
    : (draft?.priceMin && draft?.priceMax)
      ? `${formatPrice(draft.priceMin)} - ${formatPrice(draft.priceMax)}`
      : 'Seeking Offers';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Property Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Property Name & Address */}
        <div>
          <h3 className="text-xl font-semibold text-slate-900">
            {draft?.propertyName || 'Untitled Property'}
          </h3>
          <p className="text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="h-4 w-4" />
            {draft?.propertyAddress || 'Address not provided'}
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Asset Type</p>
            <p className="font-semibold mt-1">{draft?.assetType || 'N/A'}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Asking Price</p>
            <p className="font-semibold mt-1">{priceDisplay}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Listing Type</p>
            <p className="font-semibold mt-1">
              {listing?.listingType === 'PUBLIC' ? 'Public' : 'Private'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Status</p>
            <Badge variant={draft?.status === 'LISTED_ACTIVE' ? 'default' : 'outline'} className="mt-1">
              {draft?.status === 'LISTED_PENDING_BROKER' ? 'Pending Acceptance' :
               draft?.status === 'LISTED_ACTIVE' ? 'Active' :
               draft?.status}
            </Badge>
          </div>
        </div>

        {/* Seller Info (if available) */}
        {listing?.invitedByName && (
          <div className="border-t pt-4">
            <p className="text-sm text-slate-500">Seller Contact</p>
            <p className="font-medium mt-1">{listing.invitedByName}</p>
            <p className="text-sm text-slate-500">{listing.invitedByEmail}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Broker Actions Card
 * Shows actions broker can take based on listing status
 */
function BrokerActionsCard({ draft, isAccepted }) {
  if (!isAccepted) {
    return (
      <Card className="bg-slate-50">
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-slate-500">
            <AlertCircle className="h-5 w-5" />
            <p>Accept the invitation to unlock broker tools and actions.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broker Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button variant="outline" className="justify-start gap-2 h-auto py-4" disabled>
            <FileText className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Marketing Materials</div>
              <div className="text-sm text-slate-500">Create and manage OM</div>
            </div>
          </Button>
          <Button variant="outline" className="justify-start gap-2 h-auto py-4" disabled>
            <Calendar className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Showings</div>
              <div className="text-sm text-slate-500">Schedule property tours</div>
            </div>
          </Button>
          <Button variant="outline" className="justify-start gap-2 h-auto py-4" disabled>
            <Users className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Buyer Outreach</div>
              <div className="text-sm text-slate-500">Distribute to qualified buyers</div>
            </div>
          </Button>
          <Button variant="outline" className="justify-start gap-2 h-auto py-4" disabled>
            <DollarSign className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Offers</div>
              <div className="text-sm text-slate-500">Review and manage offers</div>
            </div>
          </Button>
        </div>
        <p className="text-sm text-slate-500 mt-4 text-center">
          These features are coming soon.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * BrokerDealView
 *
 * A completely separate view for brokers accessing deals they've been invited to.
 * This ensures brokers only see data they're authorized to see - NO financial details,
 * NO internal notes, NO edit capabilities beyond their broker role.
 */
export default function BrokerDealView({
  dealDraftId,
  draft,
  accessData,
  listingData
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  // Chat context for opening inquiry threads
  // This component is rendered within ChatProvider (in Layout.jsx)
  const chatContext = useChatContext();

  const invitation = accessData?.invitation;
  const isAccepted = accessData?.relation === 'broker_accepted';

  // Handle reply to buyer inquiry
  const handleReplyToInquiry = async (inquiry) => {
    console.log('[BrokerDealView] Opening chat for inquiry', {
      dealDraftId,
      buyerUserId: inquiry.buyerUserId,
      buyerName: inquiry.buyerName
    });

    if (!chatContext?.openDealInquiryThread) {
      toast({
        title: "Chat unavailable",
        description: "The messaging system is not available. Please try again later.",
        variant: "destructive"
      });
      return;
    }

    try {
      await chatContext.openDealInquiryThread(dealDraftId, inquiry.buyerUserId, {
        buyerQuestions: inquiry.questionsForBroker,
        buyerName: inquiry.buyerName,
        propertyName: draft?.propertyName
      });
    } catch (error) {
      console.error('[BrokerDealView] Failed to open inquiry thread:', error);
      toast({
        title: "Failed to open chat",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    }
  };

  // Accept invitation mutation
  const acceptMutation = useMutation({
    mutationFn: () => bff.brokerInvitations.accept(invitation.id),
    onSuccess: (data) => {
      toast({
        title: "Invitation accepted!",
        description: "You are now the listing broker for this property."
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries(['dealAccess', dealDraftId]);
      queryClient.invalidateQueries(['intakeDraft', dealDraftId]);
      queryClient.invalidateQueries(['brokerInvitations']);
    },
    onError: (error) => {
      toast({
        title: "Failed to accept invitation",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Decline invitation mutation
  const declineMutation = useMutation({
    mutationFn: () => bff.brokerInvitations.decline(invitation.id),
    onSuccess: () => {
      toast({
        title: "Invitation declined",
        description: "You have declined this listing invitation."
      });
      // Navigate back to listings
      navigate(createPageUrl('DealDrafts'));
    },
    onError: (error) => {
      toast({
        title: "Failed to decline invitation",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Back to listings */}
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl('DealDrafts'))}
          className="gap-2"
        >
          <Home className="h-4 w-4" />
          Back to My Listings
        </Button>

        {/* Invitation Banner (if pending) */}
        <InvitationActionBanner
          invitation={invitation}
          onAccept={() => acceptMutation.mutate()}
          onDecline={() => declineMutation.mutate()}
          isAccepting={acceptMutation.isLoading}
          isDeclining={declineMutation.isLoading}
        />

        {/* Property Header */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {draft?.propertyName || 'Property Details'}
              </h1>
              <p className="text-slate-500 mt-1">
                {draft?.propertyAddress}
              </p>
            </div>
            <Badge
              variant={isAccepted ? 'default' : 'outline'}
              className={isAccepted ? 'bg-green-600' : 'border-amber-500 text-amber-700'}
            >
              {isAccepted ? 'Active Listing' : 'Invitation Pending'}
            </Badge>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="buyers" disabled={!isAccepted}>Buyers</TabsTrigger>
            <TabsTrigger value="marketing" disabled={!isAccepted}>Marketing</TabsTrigger>
            <TabsTrigger value="showings" disabled={!isAccepted}>Showings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <PropertyOverviewCard draft={draft} listing={listingData} />
            <BrokerActionsCard draft={draft} isAccepted={isAccepted} />
          </TabsContent>

          <TabsContent value="buyers" className="mt-6">
            <BuyerInquiryList
              dealDraftId={dealDraftId}
              onReply={handleReplyToInquiry}
            />
          </TabsContent>

          <TabsContent value="marketing" className="mt-6">
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Marketing materials coming soon.</p>
                <p className="text-sm mt-2">Create and manage offering memorandum, flyers, and more.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="showings" className="mt-6">
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Showings management coming soon.</p>
                <p className="text-sm mt-2">Schedule and track property tours with potential buyers.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Privacy Notice */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Broker View</p>
                <p className="mt-1">
                  As the listing broker, you have access to property marketing information.
                  Sensitive financial details and internal documents are only visible to the property owner.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
