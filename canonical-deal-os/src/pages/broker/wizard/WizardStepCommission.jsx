import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Check, X, MessageSquare, Clock, AlertTriangle, DollarSign, Percent } from 'lucide-react';
import { bff } from '@/api/bffClient';

/**
 * Format commission rate as percentage
 */
function formatPercent(rate) {
  if (!rate) return '';
  const num = parseFloat(rate);
  return (num * 100).toFixed(2) + '%';
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  if (!amount) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Commission terms display component
 */
function CommissionTermsDisplay({ type, rate, amount, notes, label = "Proposed Terms" }) {
  return (
    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
      <h4 className="text-sm font-medium text-slate-700">{label}</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500">Commission Type</p>
          <p className="text-sm font-medium text-slate-900 capitalize">
            {type?.toLowerCase().replace(/_/g, ' ') || 'Not specified'}
          </p>
        </div>
        {type === 'PERCENTAGE' && rate && (
          <div>
            <p className="text-xs text-slate-500">Rate</p>
            <p className="text-sm font-medium text-slate-900">{formatPercent(rate)}</p>
          </div>
        )}
        {type === 'FLAT_FEE' && amount && (
          <div>
            <p className="text-xs text-slate-500">Amount</p>
            <p className="text-sm font-medium text-slate-900">{formatCurrency(amount)}</p>
          </div>
        )}
      </div>
      {notes && (
        <div className="pt-2 border-t border-slate-200">
          <p className="text-xs text-slate-500">Notes</p>
          <p className="text-sm text-slate-700">{notes}</p>
        </div>
      )}
    </div>
  );
}

/**
 * WizardStepCommission - Step 2
 *
 * Displays seller's proposed commission terms (if any) and allows the broker to:
 * - Accept the terms
 * - Submit a counter-offer
 * - Request to negotiate later
 */
export default function WizardStepCommission({ invitation, formData, onChange }) {
  const queryClient = useQueryClient();
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterOffer, setCounterOffer] = useState({
    commissionType: 'PERCENTAGE',
    commissionRate: '',
    commissionAmount: '',
    notes: ''
  });

  console.log('[WizardStepCommission] Rendering', {
    invitationId: invitation?.id,
    negotiationStatus: formData.commissionNegotiationStatus,
    hasSellerTerms: !!invitation?.commissionType
  });

  const hasSellerTerms = !!invitation?.commissionType;

  /**
   * Accept the seller's terms
   */
  const handleAcceptTerms = () => {
    console.log('[WizardStepCommission] Accepting seller terms');
    onChange({
      commissionTermsAccepted: true,
      commissionNegotiationStatus: 'AGREED',
      agreedCommissionType: invitation?.commissionType,
      agreedCommissionRate: invitation?.commissionRate,
      agreedCommissionAmount: invitation?.commissionAmount
    });
  };

  /**
   * Request to negotiate later
   */
  const handleNegotiateLater = () => {
    console.log('[WizardStepCommission] Flagging negotiate later');
    onChange({
      commissionNegotiationStatus: 'NEGOTIATE_LATER'
    });
  };

  /**
   * Submit counter-offer
   */
  const handleSubmitCounter = () => {
    console.log('[WizardStepCommission] Submitting counter-offer', counterOffer);
    // For Phase 2, this will call the API
    // For now, just update local state
    onChange({
      commissionNegotiationStatus: 'PENDING',
      counterOffer: counterOffer
    });
    setShowCounterForm(false);
  };

  // Already agreed or flagged for later
  if (formData.commissionNegotiationStatus === 'AGREED') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Commission Terms</h2>
          <p className="text-slate-500">Commission terms have been agreed upon.</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <Check className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <p className="font-medium text-green-800">Terms Accepted</p>
            <p className="text-sm text-green-700 mt-1">
              You have accepted the commission terms. You can proceed to the next step.
            </p>
          </div>
        </div>

        <CommissionTermsDisplay
          type={formData.agreedCommissionType || invitation?.commissionType}
          rate={formData.agreedCommissionRate || invitation?.commissionRate}
          amount={formData.agreedCommissionAmount || invitation?.commissionAmount}
          notes={invitation?.commissionNotes}
          label="Agreed Terms"
        />
      </div>
    );
  }

  if (formData.commissionNegotiationStatus === 'NEGOTIATE_LATER') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Commission Terms</h2>
          <p className="text-slate-500">Commission negotiation will be handled separately.</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Negotiate Later</p>
            <p className="text-sm text-amber-700 mt-1">
              You've chosen to negotiate commission terms separately. The listing will proceed with terms to be finalized.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => onChange({ commissionNegotiationStatus: 'NONE' })}
          className="w-full"
        >
          Change Decision
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Commission Terms</h2>
        <p className="text-slate-500">
          {hasSellerTerms
            ? "The seller has proposed commission terms. You can accept, counter, or negotiate later."
            : "No commission terms have been proposed. You can propose terms or proceed to negotiate later."}
        </p>
      </div>

      {/* Seller's Proposed Terms */}
      {hasSellerTerms && (
        <CommissionTermsDisplay
          type={invitation.commissionType}
          rate={invitation.commissionRate}
          amount={invitation.commissionAmount}
          notes={invitation.commissionNotes}
          label="Seller's Proposed Terms"
        />
      )}

      {/* Action Buttons */}
      {!showCounterForm && (
        <div className="space-y-3">
          {hasSellerTerms && (
            <Button onClick={handleAcceptTerms} className="w-full gap-2">
              <Check className="h-4 w-4" />
              Accept Terms
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => setShowCounterForm(true)}
            className="w-full gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            {hasSellerTerms ? 'Counter-Offer' : 'Propose Terms'}
          </Button>

          <Button
            variant="ghost"
            onClick={handleNegotiateLater}
            className="w-full gap-2 text-slate-500"
          >
            <Clock className="h-4 w-4" />
            Negotiate Later
          </Button>
        </div>
      )}

      {/* Counter-Offer Form */}
      {showCounterForm && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-slate-900">
            {hasSellerTerms ? 'Your Counter-Offer' : 'Your Proposed Terms'}
          </h3>

          {/* Commission Type */}
          <div className="space-y-2">
            <Label>Commission Type</Label>
            <RadioGroup
              value={counterOffer.commissionType}
              onValueChange={(value) => setCounterOffer(prev => ({ ...prev, commissionType: value }))}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="PERCENTAGE" id="percentage" />
                <Label htmlFor="percentage" className="font-normal cursor-pointer">Percentage</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="FLAT_FEE" id="flat_fee" />
                <Label htmlFor="flat_fee" className="font-normal cursor-pointer">Flat Fee</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Rate or Amount */}
          {counterOffer.commissionType === 'PERCENTAGE' ? (
            <div className="space-y-2">
              <Label htmlFor="rate">Commission Rate (%)</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="3.00"
                  value={counterOffer.commissionRate}
                  onChange={(e) => setCounterOffer(prev => ({ ...prev, commissionRate: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="amount">Commission Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  placeholder="50000"
                  value={counterOffer.commissionAmount}
                  onChange={(e) => setCounterOffer(prev => ({ ...prev, commissionAmount: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional terms or conditions..."
              value={counterOffer.notes}
              onChange={(e) => setCounterOffer(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowCounterForm(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCounter}
              disabled={
                (counterOffer.commissionType === 'PERCENTAGE' && !counterOffer.commissionRate) ||
                (counterOffer.commissionType === 'FLAT_FEE' && !counterOffer.commissionAmount)
              }
              className="flex-1"
            >
              Submit
            </Button>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="text-sm text-slate-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <strong className="text-blue-700">Note:</strong> Commission terms must be agreed upon or flagged for later negotiation before proceeding.
      </div>
    </div>
  );
}
