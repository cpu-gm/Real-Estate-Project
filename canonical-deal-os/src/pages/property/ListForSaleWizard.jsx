import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DollarSign,
  Users,
  Globe,
  Lock,
  FileText,
  Send,
  Building2
} from 'lucide-react';
import { bff } from '@/api/bffClient';
import { createPageUrl } from '@/utils';
import { PageError } from '@/components/ui/page-state';
import { useIntakeDealOverview } from '@/lib/hooks/useIntakeDealOverview';

const STEPS = [
  { id: 'pricing', title: 'Pricing', description: 'Set your asking price' },
  { id: 'broker', title: 'Broker', description: 'Choose your broker' },
  { id: 'listing', title: 'Listing Type', description: 'Public or private' },
  { id: 'review', title: 'Review', description: 'Preview your listing' },
  { id: 'confirm', title: 'Confirm', description: 'Launch listing' }
];

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

function PricingStep({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Set Your Asking Price</h2>
        <p className="text-slate-500">Choose how you want to price your property.</p>
      </div>

      <RadioGroup
        value={data.pricingType || 'fixed'}
        onValueChange={(value) => onChange({ ...data, pricingType: value })}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="fixed" id="fixed" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="fixed" className="font-medium cursor-pointer">Fixed Asking Price</Label>
            <p className="text-sm text-slate-500">Set a specific price for your property</p>
          </div>
        </div>
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="range" id="range" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="range" className="font-medium cursor-pointer">Price Range</Label>
            <p className="text-sm text-slate-500">Specify a price range to attract offers</p>
          </div>
        </div>
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="offers" id="offers" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="offers" className="font-medium cursor-pointer">Seeking Offers</Label>
            <p className="text-sm text-slate-500">Let buyers make their best offer</p>
          </div>
        </div>
      </RadioGroup>

      {data.pricingType === 'fixed' && (
        <div className="space-y-2">
          <Label htmlFor="askingPrice">Asking Price</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              id="askingPrice"
              type="text"
              placeholder="0"
              value={data.askingPrice || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                onChange({ ...data, askingPrice: value });
              }}
              className="pl-9"
            />
          </div>
          {data.askingPrice && (
            <p className="text-sm text-slate-500">
              ${parseInt(data.askingPrice).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {data.pricingType === 'range' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priceMin">Minimum Price</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="priceMin"
                type="text"
                placeholder="0"
                value={data.priceMin || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  onChange({ ...data, priceMin: value });
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceMax">Maximum Price</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="priceMax"
                type="text"
                placeholder="0"
                value={data.priceMax || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  onChange({ ...data, priceMax: value });
                }}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BrokerStep({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Choose Your Broker</h2>
        <p className="text-slate-500">Decide if you want to work with a broker or list independently.</p>
      </div>

      <RadioGroup
        value={data.brokerOption || 'none'}
        onValueChange={(value) => onChange({ ...data, brokerOption: value })}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="invite" id="invite" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="invite" className="font-medium cursor-pointer">Invite a Broker</Label>
            <p className="text-sm text-slate-500">Send an invitation to a broker to represent your listing</p>
          </div>
        </div>
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="none" id="none" className="mt-1" />
          <div className="flex-1">
            <Label htmlFor="none" className="font-medium cursor-pointer">List Without Broker</Label>
            <p className="text-sm text-slate-500">Manage the sale yourself through the platform</p>
          </div>
        </div>
      </RadioGroup>

      {data.brokerOption === 'invite' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brokerEmail">Broker Email</Label>
            <Input
              id="brokerEmail"
              type="email"
              placeholder="broker@example.com"
              value={data.brokerEmail || ''}
              onChange={(e) => onChange({ ...data, brokerEmail: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerName">Broker Name (Optional)</Label>
            <Input
              id="brokerName"
              type="text"
              placeholder="John Smith"
              value={data.brokerName || ''}
              onChange={(e) => onChange({ ...data, brokerName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerCompany">Brokerage (Optional)</Label>
            <Input
              id="brokerCompany"
              type="text"
              placeholder="ABC Realty"
              value={data.brokerCompany || ''}
              onChange={(e) => onChange({ ...data, brokerCompany: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ListingTypeStep({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Listing Type</h2>
        <p className="text-slate-500">Choose how you want to distribute your listing.</p>
      </div>

      <RadioGroup
        value={data.listingType || 'private'}
        onValueChange={(value) => onChange({ ...data, listingType: value })}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="public" id="public" className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="public" className="font-medium cursor-pointer">Public Marketplace</Label>
              <Globe className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">
              List publicly on the marketplace. Any qualified buyer can view and request access.
            </p>
          </div>
        </div>
        <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
          <RadioGroupItem value="private" id="private" className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="private" className="font-medium cursor-pointer">Private Distribution</Label>
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">
              Send to selected buyers only. You control who sees the offering memorandum.
            </p>
          </div>
        </div>
      </RadioGroup>

      {data.listingType === 'private' && (
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Distribution Recipients</span>
          </div>
          <p className="text-sm text-slate-500">
            After creating the listing, you'll be able to select buyers to send the OM to.
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewStep({ data, draft }) {
  const formatPrice = (value) => {
    if (!value) return '-';
    return `$${parseInt(value).toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Review Your Listing</h2>
        <p className="text-slate-500">Please review the details before publishing.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Property
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Property Name</span>
            <span className="font-medium">{draft?.propertyName || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Address</span>
            <span className="font-medium">{draft?.propertyAddress || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Asset Type</span>
            <span className="font-medium">{draft?.assetType || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Units</span>
            <span className="font-medium">{draft?.unitCount || 'N/A'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Pricing Type</span>
            <Badge variant="outline">
              {data.pricingType === 'fixed' && 'Fixed Price'}
              {data.pricingType === 'range' && 'Price Range'}
              {data.pricingType === 'offers' && 'Seeking Offers'}
            </Badge>
          </div>
          {data.pricingType === 'fixed' && (
            <div className="flex justify-between">
              <span className="text-slate-500">Asking Price</span>
              <span className="font-medium">{formatPrice(data.askingPrice)}</span>
            </div>
          )}
          {data.pricingType === 'range' && (
            <div className="flex justify-between">
              <span className="text-slate-500">Price Range</span>
              <span className="font-medium">
                {formatPrice(data.priceMin)} - {formatPrice(data.priceMax)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Broker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Broker Option</span>
            <Badge variant="outline">
              {data.brokerOption === 'invite' ? 'Invited Broker' : 'No Broker'}
            </Badge>
          </div>
          {data.brokerOption === 'invite' && data.brokerEmail && (
            <div className="flex justify-between">
              <span className="text-slate-500">Broker Email</span>
              <span className="font-medium">{data.brokerEmail}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {data.listingType === 'public' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Listing Type</span>
            <Badge variant="outline">
              {data.listingType === 'public' ? 'Public Marketplace' : 'Private Distribution'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmStep({ data, isSubmitting }) {
  return (
    <div className="space-y-6 text-center py-8">
      <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
        <Send className="h-8 w-8 text-blue-600" />
      </div>

      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Ready to List</h2>
        <p className="text-slate-500">
          {data.listingType === 'public'
            ? 'Your property will be listed on the public marketplace.'
            : 'Your property will be ready for private distribution.'}
        </p>
      </div>

      {data.brokerOption === 'invite' && data.brokerEmail && (
        <div className="p-4 bg-slate-50 rounded-lg text-left">
          <p className="text-sm text-slate-600">
            An invitation will be sent to <strong>{data.brokerEmail}</strong> to represent this listing.
          </p>
        </div>
      )}

      {isSubmitting && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Creating your listing...
        </div>
      )}
    </div>
  );
}

export default function ListForSaleWizard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dealDraftId = searchParams.get('dealDraftId');

  const [currentStep, setCurrentStep] = useState('pricing');
  const [formData, setFormData] = useState({
    pricingType: 'fixed',
    askingPrice: '',
    priceMin: '',
    priceMax: '',
    brokerOption: 'none',
    brokerEmail: '',
    brokerName: '',
    brokerCompany: '',
    listingType: 'private'
  });

  const {
    draft,
    isLoading: draftLoading,
    error: draftError
  } = useIntakeDealOverview(dealDraftId);

  const listingMutation = useMutation({
    mutationFn: async (data) => {
      // Create listing with optional broker invitation
      const payload = {
        pricingType: data.pricingType,
        askingPrice: data.pricingType === 'fixed' ? parseInt(data.askingPrice) : null,
        priceMin: data.pricingType === 'range' ? parseInt(data.priceMin) : null,
        priceMax: data.pricingType === 'range' ? parseInt(data.priceMax) : null,
        listingType: data.listingType,
        broker: data.brokerOption === 'invite' && data.brokerEmail ? {
          email: data.brokerEmail,
          name: data.brokerName || null,
          firmName: data.brokerCompany || null
        } : null
      };

      return bff.dealIntake.createListing(dealDraftId, payload);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(['intakeDraft', dealDraftId]);
      queryClient.invalidateQueries(['listing', dealDraftId]);
      // Navigate back to DealWorkspace with success
      navigate(createPageUrl('DealWorkspace') + `?dealDraftId=${dealDraftId}`);
    },
    onError: (error) => {
      console.error('Failed to create listing:', error);
    }
  });

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'pricing':
        if (formData.pricingType === 'fixed') return formData.askingPrice?.length > 0;
        if (formData.pricingType === 'range') return formData.priceMin?.length > 0 && formData.priceMax?.length > 0;
        return true;
      case 'broker':
        if (formData.brokerOption === 'invite') return formData.brokerEmail?.length > 0;
        return true;
      case 'listing':
        return true;
      case 'review':
        return true;
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (currentStep === 'confirm') {
      listingMutation.mutate(formData);
    } else {
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < STEPS.length) {
        setCurrentStep(STEPS[nextIndex].id);
      }
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    } else {
      navigate(-1);
    }
  };

  if (!dealDraftId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">
            Missing dealDraftId. Please select a property to list.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="p-6">
        <PageError error={draftError} />
      </div>
    );
  }

  if (draftLoading) {
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">List for Sale</h1>
            <p className="text-sm text-slate-500">{draft?.propertyName}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} steps={STEPS} />

        {/* Step Content */}
        <Card className="mb-6">
          <CardContent className="p-6">
            {currentStep === 'pricing' && (
              <PricingStep data={formData} onChange={setFormData} />
            )}
            {currentStep === 'broker' && (
              <BrokerStep data={formData} onChange={setFormData} />
            )}
            {currentStep === 'listing' && (
              <ListingTypeStep data={formData} onChange={setFormData} />
            )}
            {currentStep === 'review' && (
              <ReviewStep data={formData} draft={draft} />
            )}
            {currentStep === 'confirm' && (
              <ConfirmStep data={formData} isSubmitting={listingMutation.isLoading} />
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
            disabled={!canProceed() || listingMutation.isLoading}
          >
            {currentStep === 'confirm' ? (
              <>
                <Send className="h-4 w-4 mr-2" />
                Create Listing
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {listingMutation.error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            Failed to create listing. Please try again.
          </div>
        )}
      </div>
    </div>
  );
}
