import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Check,
  DollarSign,
  Calendar,
  Globe,
  Users,
  AlertCircle
} from 'lucide-react';

const AGREEMENT_TYPES = [
  {
    id: 'EXCLUSIVE_RIGHT_TO_SELL',
    label: 'Exclusive Right to Sell',
    description: 'You have the exclusive right to sell the property and earn commission regardless of who finds the buyer.'
  },
  {
    id: 'EXCLUSIVE_AGENCY',
    label: 'Exclusive Agency',
    description: 'You are the exclusive agent, but the seller may sell the property themselves without paying commission.'
  },
  {
    id: 'OPEN_LISTING',
    label: 'Open Listing',
    description: 'Non-exclusive agreement. Commission only if you procure the buyer.'
  },
  {
    id: 'NET_LISTING',
    label: 'Net Listing',
    description: 'Commission is the difference between sale price and agreed net amount. (Check local regulations)'
  }
];

/**
 * Format commission for display
 */
function formatCommission(type, rate, amount) {
  if (type === 'PERCENTAGE' && rate) {
    const num = parseFloat(rate);
    return (num * 100).toFixed(2) + '%';
  }
  if (type === 'FLAT_FEE' && amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  }
  return 'To be negotiated';
}

/**
 * Format price for display
 */
function formatPrice(price) {
  if (!price) return 'Not specified';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(price);
}

/**
 * WizardStepAgreement - Step 4
 *
 * Final step allowing the broker to:
 * - Review all configured settings
 * - Select listing agreement type
 * - Confirm the agreement with checkbox
 * - Go live with the listing
 */
export default function WizardStepAgreement({ invitation, dealDraft, formData, onChange, isSubmitting }) {
  console.log('[WizardStepAgreement] Rendering', {
    dealDraftId: dealDraft?.id,
    agreementType: formData.agreementType,
    agreementConfirmed: formData.agreementConfirmed
  });

  const commissionDisplay = formatCommission(
    formData.agreedCommissionType || invitation?.commissionType,
    formData.agreedCommissionRate || invitation?.commissionRate,
    formData.agreedCommissionAmount || invitation?.commissionAmount
  );

  const priceDisplay = dealDraft?.askingPrice
    ? formatPrice(dealDraft.askingPrice)
    : (dealDraft?.priceMin && dealDraft?.priceMax)
      ? `${formatPrice(dealDraft.priceMin)} - ${formatPrice(dealDraft.priceMax)}`
      : 'Seeking Offers';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Agreement & Go Live</h2>
        <p className="text-slate-500">
          Review your listing configuration and confirm the agreement to go live.
        </p>
      </div>

      {/* Summary Card */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-slate-900 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Listing Summary
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* Property */}
          <div>
            <p className="text-slate-500">Property</p>
            <p className="font-medium text-slate-900">{dealDraft?.propertyName}</p>
          </div>

          {/* Price */}
          <div>
            <p className="text-slate-500">Asking Price</p>
            <p className="font-medium text-slate-900">{priceDisplay}</p>
          </div>

          {/* Commission */}
          <div>
            <p className="text-slate-500">Commission</p>
            <p className="font-medium text-slate-900 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {commissionDisplay}
            </p>
          </div>

          {/* Visibility */}
          <div>
            <p className="text-slate-500">Visibility</p>
            <p className="font-medium text-slate-900 flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {formData.visibility === 'INVITE_ONLY' ? 'Invite Only' : 'Platform Users'}
            </p>
          </div>

          {/* Target Buyers */}
          {formData.targetBuyerTypes?.length > 0 && (
            <div className="col-span-2">
              <p className="text-slate-500">Target Buyers</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {formData.targetBuyerTypes.map(type => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Marketing Materials */}
          <div className="col-span-2">
            <p className="text-slate-500">Marketing Materials</p>
            <div className="flex gap-2 mt-1">
              {formData.enableOM !== false && <Badge variant="secondary">OM</Badge>}
              {formData.enableFlyers && <Badge variant="secondary">Flyers</Badge>}
              {formData.enablePropertyWebsite && <Badge variant="secondary">Property Website</Badge>}
            </div>
          </div>

          {/* Timeline */}
          {(formData.offerDeadline || formData.listingDuration) && (
            <div className="col-span-2 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-4">
                {formData.offerDeadline && (
                  <div className="flex items-center gap-1 text-sm">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    <span>Deadline: {new Date(formData.offerDeadline).toLocaleDateString()}</span>
                  </div>
                )}
                {formData.listingDuration && (
                  <div className="flex items-center gap-1 text-sm">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    <span>Duration: {formData.listingDuration} days</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agreement Type Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Listing Agreement Type</Label>
        <RadioGroup
          value={formData.agreementType || 'EXCLUSIVE_RIGHT_TO_SELL'}
          onValueChange={(value) => onChange({ agreementType: value })}
          className="space-y-3"
        >
          {AGREEMENT_TYPES.map((type) => (
            <div
              key={type.id}
              className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <RadioGroupItem value={type.id} id={type.id} className="mt-1" />
              <div className="flex-1">
                <Label htmlFor={type.id} className="font-medium cursor-pointer">
                  {type.label}
                </Label>
                <p className="text-sm text-slate-500">{type.description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Negotiate Later Warning */}
      {formData.commissionNegotiationStatus === 'NEGOTIATE_LATER' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Commission Terms Pending</p>
            <p className="text-sm text-amber-700 mt-1">
              You've chosen to negotiate commission terms separately. The listing will proceed with terms to be finalized.
            </p>
          </div>
        </div>
      )}

      {/* Agreement Confirmation */}
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-slate-900">Listing Agreement Confirmation</h3>

        <div className="text-sm text-slate-600 space-y-2">
          <p>By checking the box below, you confirm that:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>You are authorized to represent this property as listing broker</li>
            <li>You have reviewed and agree to the commission terms</li>
            <li>You understand the selected listing agreement type</li>
            <li>You are ready to begin marketing this property</li>
          </ul>
        </div>

        <div
          className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
            formData.agreementConfirmed
              ? 'border-green-500 bg-green-50'
              : 'hover:bg-slate-50'
          }`}
          onClick={() => onChange({ agreementConfirmed: !formData.agreementConfirmed })}
        >
          <Checkbox
            id="agreementConfirmed"
            checked={formData.agreementConfirmed}
            onCheckedChange={(checked) => onChange({ agreementConfirmed: checked })}
          />
          <div className="flex-1">
            <Label htmlFor="agreementConfirmed" className="font-medium cursor-pointer">
              I confirm and agree to the listing agreement
            </Label>
            <p className="text-xs text-slate-500 mt-1">
              This will activate the listing and notify the seller
            </p>
          </div>
        </div>
      </div>

      {/* Final Info */}
      {formData.agreementConfirmed && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>You're ready to go live! Click "Go Live" below to activate the listing.</span>
        </div>
      )}

      {!formData.agreementConfirmed && (
        <div className="text-sm text-slate-500 bg-slate-100 rounded-lg p-3">
          Please confirm the agreement above to enable the "Go Live" button.
        </div>
      )}
    </div>
  );
}
