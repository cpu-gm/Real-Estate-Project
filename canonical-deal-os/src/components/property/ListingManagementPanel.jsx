import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  Tag,
  Globe,
  Lock,
  User,
  Calendar,
  Clock,
  DollarSign,
  Edit2,
  X,
  Send,
  Eye,
  Trash2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { bff } from '@/api/bffClient';
import { toast } from '@/components/ui/use-toast';

/**
 * Format a price for display
 */
function formatPrice(price) {
  if (!price) return '—';
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
function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
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
      return { label: 'Awaiting Broker', color: 'amber' };
    case 'LISTED_ACTIVE':
      return { label: 'Active', color: 'green' };
    case 'LISTED_UNDER_CONTRACT':
      return { label: 'Under Contract', color: 'blue' };
    case 'LISTING_CANCELLED':
      return { label: 'Cancelled', color: 'slate' };
    default:
      return { label: 'Listed', color: 'blue' };
  }
}

/**
 * ListingManagementPanel
 *
 * Slide-over panel for managing an active listing.
 */
export default function ListingManagementPanel({
  open,
  onOpenChange,
  dealDraftId,
  listing
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrice, setEditedPrice] = useState('');

  const cancelMutation = useMutation({
    mutationFn: () => bff.dealIntake.cancelListing(dealDraftId),
    onSuccess: () => {
      queryClient.invalidateQueries(['intakeDraft', dealDraftId]);
      queryClient.invalidateQueries(['listing', dealDraftId]);
      toast({
        title: 'Listing cancelled',
        description: 'Your property has been removed from the market.'
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel listing',
        variant: 'destructive'
      });
    }
  });

  const updatePriceMutation = useMutation({
    mutationFn: (newPrice) => bff.dealIntake.updateDraft(dealDraftId, {
      askingPrice: parseInt(newPrice)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['intakeDraft', dealDraftId]);
      queryClient.invalidateQueries(['listing', dealDraftId]);
      toast({
        title: 'Price updated',
        description: 'Your asking price has been updated.'
      });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update price',
        variant: 'destructive'
      });
    }
  });

  if (!listing) return null;

  const statusInfo = getStatusInfo(listing.status);
  const daysOnMarket = daysSince(listing.listedAt);

  // Determine price display
  let priceDisplay = null;
  if (listing.askingPrice) {
    priceDisplay = formatPrice(listing.askingPrice);
  } else if (listing.askingPriceMin && listing.askingPriceMax) {
    priceDisplay = `${formatPrice(listing.askingPriceMin)} - ${formatPrice(listing.askingPriceMax)}`;
  } else {
    priceDisplay = 'Seeking Offers';
  }

  const handleSavePrice = () => {
    if (editedPrice) {
      updatePriceMutation.mutate(editedPrice);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Manage Listing
          </SheetTitle>
          <SheetDescription>
            View and manage your property listing settings
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Section 1: Listing Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Listing Details</span>
                <Badge
                  variant="outline"
                  className={`
                    ${statusInfo.color === 'amber' ? 'border-amber-500 text-amber-700 bg-amber-50' : ''}
                    ${statusInfo.color === 'green' ? 'border-green-500 text-green-700 bg-green-50' : ''}
                    ${statusInfo.color === 'blue' ? 'border-blue-500 text-blue-700 bg-blue-50' : ''}
                    ${statusInfo.color === 'slate' ? 'border-slate-500 text-slate-700 bg-slate-50' : ''}
                  `}
                >
                  {statusInfo.label}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Price */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <DollarSign className="h-4 w-4" />
                  <span>Asking Price</span>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editedPrice}
                      onChange={(e) => setEditedPrice(e.target.value)}
                      placeholder={listing.askingPrice?.toString() || ''}
                      className="w-32 h-8 text-sm"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSavePrice}
                      disabled={updatePriceMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{priceDisplay}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditedPrice(listing.askingPrice?.toString() || '');
                        setIsEditing(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Listing Type */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  {listing.listingType === 'PUBLIC' ? (
                    <Globe className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  <span>Listing Type</span>
                </div>
                <span className="font-medium">
                  {listing.listingType === 'PUBLIC' ? 'Public Marketplace' : 'Private Distribution'}
                </span>
              </div>

              {/* Listed Date */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="h-4 w-4" />
                  <span>Listed Date</span>
                </div>
                <span className="font-medium">{formatDate(listing.listedAt)}</span>
              </div>

              {/* Days on Market */}
              {daysOnMarket !== null && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Clock className="h-4 w-4" />
                    <span>Days on Market</span>
                  </div>
                  <span className="font-medium">{daysOnMarket}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Broker Assignment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Broker Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {listing.broker ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {listing.broker.name || listing.broker.email}
                      </div>
                      {listing.broker.firmName && (
                        <div className="text-sm text-slate-500">{listing.broker.firmName}</div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        listing.broker.status === 'ACCEPTED'
                          ? 'border-green-500 text-green-700 bg-green-50'
                          : listing.broker.status === 'PENDING'
                          ? 'border-amber-500 text-amber-700 bg-amber-50'
                          : ''
                      }
                    >
                      {listing.broker.status === 'ACCEPTED' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {listing.broker.status === 'PENDING' && <Clock className="h-3 w-3 mr-1" />}
                      {listing.broker.status === 'ACCEPTED' ? 'Confirmed' :
                       listing.broker.status === 'PENDING' ? 'Pending' :
                       listing.broker.status}
                    </Badge>
                  </div>

                  {listing.broker.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-2">
                        <Send className="h-4 w-4" />
                        Resend Invitation
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  <User className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 mb-3">No broker assigned</p>
                  <Button variant="outline" size="sm">
                    Invite a Broker
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Activity (future) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4 text-slate-500">
                <Eye className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm">Activity tracking coming soon</p>
                <p className="text-xs text-slate-400">Views, inquiries, and interested buyers</p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Section 4: Actions */}
          <div className="space-y-3">
            {listing.listingType === 'PUBLIC' && (
              <Button variant="outline" className="w-full gap-2">
                <Eye className="h-4 w-4" />
                View Public Listing
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Cancel Listing
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Listing?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove your property from the market. Any pending broker invitations
                    will be cancelled. You can re-list the property later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Listed</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Listing'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
