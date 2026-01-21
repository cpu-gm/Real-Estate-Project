import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tag,
  Globe,
  Lock,
  User,
  Clock,
  Settings,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

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
 * Calculate days since a date
 */
function daysSince(date) {
  if (!date) return null;
  const now = new Date();
  const then = new Date(date);
  const diffTime = Math.abs(now - then);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get status display info
 */
function getStatusInfo(status) {
  switch (status) {
    case 'LISTED_PENDING_BROKER':
      return {
        label: 'Awaiting Broker',
        variant: 'warning',
        icon: Clock,
        description: 'Waiting for broker to accept invitation'
      };
    case 'LISTED_ACTIVE':
      return {
        label: 'Active',
        variant: 'success',
        icon: CheckCircle,
        description: 'Listed and active on market'
      };
    case 'LISTED_UNDER_CONTRACT':
      return {
        label: 'Under Contract',
        variant: 'info',
        icon: Tag,
        description: 'Offer accepted, in contract'
      };
    case 'LISTING_CANCELLED':
      return {
        label: 'Cancelled',
        variant: 'secondary',
        icon: AlertCircle,
        description: 'Listing has been cancelled'
      };
    default:
      return {
        label: 'Listed',
        variant: 'default',
        icon: Tag,
        description: ''
      };
  }
}

/**
 * ListingStatusBanner
 *
 * Displays a prominent banner showing the current listing status.
 * Position: Below PropertyHero, above PropertyKPICards
 */
export default function ListingStatusBanner({
  status,
  listingType,
  askingPrice,
  priceMin,
  priceMax,
  brokerName,
  brokerEmail,
  brokerStatus,
  listedAt,
  onManageListing
}) {
  const statusInfo = getStatusInfo(status);
  const StatusIcon = statusInfo.icon;
  const daysOnMarket = daysSince(listedAt);

  // Determine price display
  let priceDisplay = null;
  if (askingPrice) {
    priceDisplay = formatPrice(askingPrice);
  } else if (priceMin && priceMax) {
    priceDisplay = `${formatPrice(priceMin)} - ${formatPrice(priceMax)}`;
  } else {
    priceDisplay = 'Seeking Offers';
  }

  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
      <CardContent className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Status and listing type */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-5 w-5 ${
                statusInfo.variant === 'warning' ? 'text-amber-500' :
                statusInfo.variant === 'success' ? 'text-green-500' :
                'text-blue-500'
              }`} />
              <Badge variant={
                statusInfo.variant === 'warning' ? 'outline' :
                statusInfo.variant === 'success' ? 'default' :
                'secondary'
              } className={
                statusInfo.variant === 'warning' ? 'border-amber-500 text-amber-700 bg-amber-50' :
                statusInfo.variant === 'success' ? 'bg-green-600' :
                ''
              }>
                {statusInfo.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              {listingType === 'PUBLIC' ? (
                <>
                  <Globe className="h-4 w-4" />
                  <span>Public</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Private</span>
                </>
              )}
            </div>
          </div>

          {/* Center: Price */}
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-slate-900">{priceDisplay}</div>
            {daysOnMarket !== null && (
              <div className="text-xs text-slate-500">
                {daysOnMarket === 0 ? 'Listed today' :
                 daysOnMarket === 1 ? '1 day on market' :
                 `${daysOnMarket} days on market`}
              </div>
            )}
          </div>

          {/* Right: Broker info and action */}
          <div className="flex items-center gap-4">
            {(brokerName || brokerEmail) && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="font-medium text-slate-700">
                    {brokerName || brokerEmail}
                  </div>
                  {brokerStatus && (
                    <div className={`text-xs ${
                      brokerStatus === 'ACCEPTED' ? 'text-green-600' :
                      brokerStatus === 'PENDING' ? 'text-amber-600' :
                      'text-slate-500'
                    }`}>
                      {brokerStatus === 'ACCEPTED' ? 'Confirmed' :
                       brokerStatus === 'PENDING' ? 'Invitation Pending' :
                       brokerStatus}
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onManageListing}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Manage Listing
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
