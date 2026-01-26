import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { bff } from "@/api/bffClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Building2,
  MapPin,
  DollarSign,
  Clock,
  Check,
  X,
  Loader2,
  User,
  ArrowRight
} from "lucide-react";

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
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * BrokerInvitationCard
 *
 * Card component for displaying a broker invitation with accept/decline actions.
 * Used in the broker's DealDrafts/My Listings page.
 */
export default function BrokerInvitationCard({ invitation }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deal = invitation.dealDraft;

  const priceDisplay = deal?.askingPrice
    ? formatPrice(deal.askingPrice)
    : (deal?.priceMin && deal?.priceMax)
      ? `${formatPrice(deal.priceMin)} - ${formatPrice(deal.priceMax)}`
      : 'Seeking Offers';

  /**
   * Navigate to the accept wizard instead of direct accept
   */
  const handleAccept = () => {
    console.log('[BrokerInvitationCard] Opening accept wizard', { invitationId: invitation.id });
    navigate(createPageUrl(`BrokerAcceptWizard?invitationId=${invitation.id}`));
  };

  // Decline invitation mutation
  const declineMutation = useMutation({
    mutationFn: () => bff.brokerInvitations.decline(invitation.id),
    onSuccess: () => {
      toast({
        title: "Invitation declined"
      });
      queryClient.invalidateQueries(['brokerInvitations']);
    },
    onError: (error) => {
      toast({
        title: "Failed to decline invitation",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const isLoading = declineMutation.isLoading;

  return (
    <Card className="border-amber-200 bg-amber-50/50 hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        {/* Header with property name and pending badge */}
        <div className="flex items-start justify-between mb-3">
          <Link
            to={createPageUrl(`DealWorkspace?dealDraftId=${deal?.id}`)}
            className="hover:underline"
          >
            <h3 className="font-semibold text-slate-900">
              {deal?.propertyName || 'Untitled Property'}
            </h3>
          </Link>
          <Badge variant="outline" className="border-amber-500 text-amber-700 flex-shrink-0">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        </div>

        {/* Property address */}
        <p className="text-sm text-slate-500 flex items-center gap-1 mb-3">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{deal?.propertyAddress || 'Address not provided'}</span>
        </p>

        {/* Property details */}
        <div className="flex items-center gap-4 text-sm mb-4">
          <div className="flex items-center gap-1 text-slate-600">
            <Building2 className="h-4 w-4" />
            <span>{deal?.assetType || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600">
            <DollarSign className="h-4 w-4" />
            <span>{priceDisplay}</span>
          </div>
        </div>

        {/* Inviter info */}
        <div className="text-sm text-slate-500 mb-4 border-t border-amber-200 pt-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>
              Invited by <span className="font-medium text-slate-700">{invitation.invitedByName || invitation.invitedByEmail}</span>
            </span>
          </div>
          <p className="text-xs mt-1 ml-6">
            {formatDate(invitation.sentAt)} &bull; Expires {formatDate(invitation.expiresAt)}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleAccept}
            disabled={isLoading}
            className="flex-1 gap-1"
            size="sm"
          >
            <ArrowRight className="h-4 w-4" />
            Review & Accept
          </Button>
          <Button
            variant="outline"
            onClick={() => declineMutation.mutate()}
            disabled={isLoading}
            className="flex-1 gap-1"
            size="sm"
          >
            {declineMutation.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
