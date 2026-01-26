import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Check, Send, Loader2 } from 'lucide-react';
import { bff } from '@/api/bffClient';
import { createPageUrl } from '@/utils';
import { PageError } from '@/components/ui/page-state';
import WizardStepReview from './wizard/WizardStepReview';
import WizardStepCommission from './wizard/WizardStepCommission';
import WizardStepMarketing from './wizard/WizardStepMarketing';
import WizardStepAgreement from './wizard/WizardStepAgreement';

const STEPS = [
  { id: 'review', title: 'Review Property', description: 'Review listing details' },
  { id: 'commission', title: 'Commission Terms', description: 'Agree on commission' },
  { id: 'marketing', title: 'Marketing Config', description: 'Configure marketing' },
  { id: 'agreement', title: 'Agreement & Go Live', description: 'Finalize agreement' }
];

/**
 * Step indicator with progress bar
 */
function StepIndicator({ currentStep, steps }) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);
  const progress = ((currentIndex + 1) / steps.length) * 100;

  return (
    <div className="mb-8">
      <Progress value={progress} className="h-2 mb-4" />
      <div className="flex justify-between">
        {steps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div
              key={step.id}
              className={`flex flex-col items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-2 ${
                  isComplete
                    ? 'bg-green-600 text-white'
                    : isCurrent
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isComplete ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span className={`text-xs text-center ${isCurrent ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * BrokerAcceptWizard
 *
 * Multi-step wizard for brokers to accept listing invitations.
 * Steps: Review Property -> Commission Terms -> Marketing Config -> Agreement & Go Live
 */
export default function BrokerAcceptWizard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invitationId = searchParams.get('invitationId');

  const [currentStep, setCurrentStep] = useState('review');
  const [formData, setFormData] = useState({
    // Commission terms
    commissionTermsAccepted: false,
    commissionNegotiationStatus: 'NONE', // NONE, PENDING, AGREED, NEGOTIATE_LATER
    // Marketing config
    visibility: 'PLATFORM',
    targetBuyerTypes: [],
    targetInvestmentMin: '',
    targetInvestmentMax: '',
    targetGeographies: [],
    enableOM: true,
    enableFlyers: false,
    enablePropertyWebsite: false,
    offerDeadline: '',
    listingDuration: 90,
    openHouseDates: [],
    // Agreement
    agreementType: 'EXCLUSIVE_RIGHT_TO_SELL',
    agreementConfirmed: false
  });

  console.log('[BrokerAcceptWizard] Initialized', { invitationId, step: currentStep });

  // Fetch invitation details
  const {
    data: invitationData,
    isLoading: invitationLoading,
    error: invitationError
  } = useQuery({
    queryKey: ['brokerInvitation', invitationId],
    queryFn: async () => {
      const result = await bff.brokerInvitations.list();
      const invitation = result.invitations?.find(inv => inv.id === invitationId);
      if (!invitation) {
        throw new Error('Invitation not found');
      }
      return invitation;
    },
    enabled: !!invitationId,
    staleTime: 30000
  });

  const invitation = invitationData;
  const dealDraft = invitation?.dealDraft;

  // Update form data when invitation loads (to pre-populate commission terms from seller)
  useEffect(() => {
    if (invitation?.commissionType) {
      console.log('[BrokerAcceptWizard] Pre-populating seller commission terms', {
        commissionType: invitation.commissionType,
        commissionRate: invitation.commissionRate,
        commissionAmount: invitation.commissionAmount
      });
      setFormData(prev => ({
        ...prev,
        sellerCommissionType: invitation.commissionType,
        sellerCommissionRate: invitation.commissionRate,
        sellerCommissionAmount: invitation.commissionAmount,
        sellerCommissionNotes: invitation.commissionNotes
      }));
    }
  }, [invitation]);

  // Go Live mutation - completes the wizard and activates the listing
  const goLiveMutation = useMutation({
    mutationFn: async () => {
      console.log('[BrokerAcceptWizard] Go Live initiated', { invitationId, formData });
      // Accept the invitation with wizard data
      const result = await bff.brokerInvitations.accept(invitationId);
      return result;
    },
    onSuccess: (result) => {
      console.log('[BrokerAcceptWizard] Go Live successful', { result });
      queryClient.invalidateQueries(['brokerInvitations']);
      queryClient.invalidateQueries(['intakeDrafts']);
      // Navigate to deal workspace
      navigate(createPageUrl('DealWorkspace') + `?dealDraftId=${dealDraft?.id}`);
    },
    onError: (error) => {
      console.error('[BrokerAcceptWizard] Go Live failed', { error: error.message });
    }
  });

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  /**
   * Check if current step can proceed to next
   */
  const canProceed = () => {
    switch (currentStep) {
      case 'review':
        // Can always proceed from review
        return true;
      case 'commission':
        // Must have commission terms resolved or flagged for later
        return formData.commissionNegotiationStatus === 'AGREED' ||
               formData.commissionNegotiationStatus === 'NEGOTIATE_LATER' ||
               formData.commissionTermsAccepted;
      case 'marketing':
        // Marketing config is optional, can always proceed
        return true;
      case 'agreement':
        // Must confirm agreement
        return formData.agreementConfirmed;
      default:
        return false;
    }
  };

  /**
   * Navigate to next step or complete wizard
   */
  const goNext = () => {
    const previousStep = currentStep;

    if (currentStep === 'agreement') {
      // Final step - complete wizard
      goLiveMutation.mutate();
    } else {
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < STEPS.length) {
        const nextStep = STEPS[nextIndex].id;
        console.log('[BrokerAcceptWizard] Step changed', { from: previousStep, to: nextStep });
        setCurrentStep(nextStep);
      }
    }
  };

  /**
   * Navigate to previous step
   */
  const goBack = () => {
    const previousStep = currentStep;
    const prevIndex = currentStepIndex - 1;

    if (prevIndex >= 0) {
      const prevStep = STEPS[prevIndex].id;
      console.log('[BrokerAcceptWizard] Step changed', { from: previousStep, to: prevStep });
      setCurrentStep(prevStep);
    } else {
      // Go back to previous page
      navigate(-1);
    }
  };

  /**
   * Update form data from a step
   */
  const handleFormChange = (updates) => {
    console.log('[BrokerAcceptWizard] Form data updated', { step: currentStep, updates });
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Missing invitation ID
  if (!invitationId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">
            Missing invitationId. Please select an invitation to accept.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (invitationLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-4 w-full mb-4" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // Error state
  if (invitationError) {
    return (
      <div className="p-6">
        <PageError error={invitationError} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Accept Listing Invitation</h1>
            <p className="text-sm text-slate-500">{dealDraft?.propertyName}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} steps={STEPS} />

        {/* Step Content */}
        <Card className="mb-6">
          <CardContent className="p-6">
            {currentStep === 'review' && (
              <WizardStepReview
                invitation={invitation}
                dealDraft={dealDraft}
              />
            )}
            {currentStep === 'commission' && (
              <WizardStepCommission
                invitation={invitation}
                formData={formData}
                onChange={handleFormChange}
              />
            )}
            {currentStep === 'marketing' && (
              <WizardStepMarketing
                dealDraft={dealDraft}
                formData={formData}
                onChange={handleFormChange}
              />
            )}
            {currentStep === 'agreement' && (
              <WizardStepAgreement
                invitation={invitation}
                dealDraft={dealDraft}
                formData={formData}
                onChange={handleFormChange}
                isSubmitting={goLiveMutation.isLoading}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={goNext}
            disabled={!canProceed() || goLiveMutation.isLoading}
          >
            {goLiveMutation.isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Going Live...
              </>
            ) : currentStep === 'agreement' ? (
              <>
                <Send className="h-4 w-4 mr-2" />
                Go Live
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Error display */}
        {goLiveMutation.isError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Failed to activate listing: {goLiveMutation.error?.message}
          </div>
        )}
      </div>
    </div>
  );
}
