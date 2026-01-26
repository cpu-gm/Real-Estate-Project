import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  User,
  Ruler,
  Image as ImageIcon
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
 * Format square footage
 */
function formatSqFt(sqft) {
  if (!sqft) return null;
  return new Intl.NumberFormat('en-US').format(sqft) + ' SF';
}

/**
 * WizardStepReview - Step 1
 *
 * Displays property details for the broker to review before proceeding.
 * This is a read-only step showing photos, description, and key selling points.
 */
export default function WizardStepReview({ invitation, dealDraft }) {
  console.log('[WizardStepReview] Rendering', { invitationId: invitation?.id, dealDraftId: dealDraft?.id });

  const priceDisplay = dealDraft?.askingPrice
    ? formatPrice(dealDraft.askingPrice)
    : (dealDraft?.priceMin && dealDraft?.priceMax)
      ? `${formatPrice(dealDraft.priceMin)} - ${formatPrice(dealDraft.priceMax)}`
      : 'Seeking Offers';

  // Parse photos if they exist (stored as JSON string)
  let photos = [];
  if (dealDraft?.photos) {
    try {
      photos = typeof dealDraft.photos === 'string'
        ? JSON.parse(dealDraft.photos)
        : dealDraft.photos;
    } catch (e) {
      console.warn('[WizardStepReview] Failed to parse photos', e);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Review Property Details</h2>
        <p className="text-slate-500">
          Please review the property information before proceeding with the listing.
        </p>
      </div>

      {/* Property Photos */}
      {photos.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Property Photos
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {photos.slice(0, 6).map((photo, index) => (
              <div key={index} className="aspect-video bg-slate-100 rounded-lg overflow-hidden">
                <img
                  src={photo.url || photo}
                  alt={`Property photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
          {photos.length > 6 && (
            <p className="text-xs text-slate-500">+{photos.length - 6} more photos</p>
          )}
        </div>
      ) : (
        <div className="bg-slate-100 rounded-lg p-8 text-center text-slate-500">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No photos available</p>
        </div>
      )}

      {/* Property Details Card */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-4">
        {/* Property Name */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {dealDraft?.propertyName || 'Untitled Property'}
          </h3>
          <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
            <MapPin className="h-4 w-4" />
            <span>{dealDraft?.propertyAddress || 'Address not provided'}</span>
          </div>
        </div>

        {/* Key Details Grid */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
          {/* Asset Type */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Asset Type</p>
              <p className="text-sm font-medium text-slate-700">
                {dealDraft?.assetType || 'Not specified'}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Asking Price</p>
              <p className="text-sm font-medium text-slate-700">{priceDisplay}</p>
            </div>
          </div>

          {/* Size */}
          {dealDraft?.squareFootage && (
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Size</p>
                <p className="text-sm font-medium text-slate-700">
                  {formatSqFt(dealDraft.squareFootage)}
                </p>
              </div>
            </div>
          )}

          {/* Year Built */}
          {dealDraft?.yearBuilt && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Year Built</p>
                <p className="text-sm font-medium text-slate-700">{dealDraft.yearBuilt}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {dealDraft?.description && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">Description</h3>
          <p className="text-sm text-slate-600 whitespace-pre-line">
            {dealDraft.description}
          </p>
        </div>
      )}

      {/* Key Selling Points */}
      {dealDraft?.keySellingPoints && dealDraft.keySellingPoints.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">Key Selling Points</h3>
          <ul className="list-disc list-inside space-y-1">
            {dealDraft.keySellingPoints.map((point, index) => (
              <li key={index} className="text-sm text-slate-600">{point}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Invitation Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <User className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-700">
              Invited by {invitation?.invitedByName || invitation?.invitedByEmail}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Sent {formatDate(invitation?.sentAt)} &bull; Expires {formatDate(invitation?.expiresAt)}
            </p>
            {invitation?.brokerFirmName && (
              <Badge variant="outline" className="mt-2">
                {invitation.brokerFirmName}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="text-sm text-slate-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <strong className="text-blue-700">Next:</strong> You'll review and agree on commission terms with the seller.
      </div>
    </div>
  );
}
