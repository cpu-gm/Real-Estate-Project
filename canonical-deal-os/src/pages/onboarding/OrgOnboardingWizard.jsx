import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  Briefcase,
  Users,
  Building2,
  DollarSign,
  FileText,
  GripVertical,
  Sparkles,
  Send,
  AlertTriangle
} from 'lucide-react';
import { IntakeChannelHub } from '@/components/onboarding';
import { useAuth } from '@/lib/AuthContext';
import { bff } from '@/api/bffClient';

// Wizard steps
const STEPS = [
  { id: 'categories', title: 'Data Types', description: 'What to import' },
  { id: 'priority', title: 'Priority', description: 'Import order' },
  { id: 'upload', title: 'Upload', description: 'Add your data' },
  { id: 'confirm', title: 'Confirm', description: 'Start processing' }
];

// Data categories
const CATEGORIES = [
  { id: 'deals', label: 'Deals', description: 'Active and historical deals', icon: Briefcase },
  { id: 'properties', label: 'Properties', description: 'Property details and photos', icon: Building2 },
  { id: 'contacts', label: 'Contacts', description: 'Brokers, lenders, attorneys', icon: Users },
  { id: 'financials', label: 'Financials', description: 'Capital calls, distributions', icon: DollarSign },
  { id: 'documents', label: 'Documents', description: 'OMs, rent rolls, T12s', icon: FileText },
  { id: 'lp_records', label: 'LP Records', description: 'Investor information', icon: Users }
];

// Historical data options
const HISTORICAL_OPTIONS = [
  { id: 'active', label: 'Active Only', description: 'Only currently active items' },
  { id: 'recent', label: 'Last 2 Years', description: 'Active plus recent history' },
  { id: 'all', label: 'All History', description: 'Import everything' }
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

// Step 1: Select Categories
function CategoriesStep({ data, onChange }) {
  const toggleCategory = (categoryId) => {
    const current = data.selectedCategories || [];
    const updated = current.includes(categoryId)
      ? current.filter(c => c !== categoryId)
      : [...current, categoryId];
    onChange({ ...data, selectedCategories: updated });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">What would you like to import?</h2>
        <p className="text-slate-500">Select the types of data you want to bring into the platform.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CATEGORIES.map(category => {
          const isSelected = (data.selectedCategories || []).includes(category.id);
          const IconComponent = category.icon;

          return (
            <div
              key={category.id}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => toggleCategory(category.id)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleCategory(category.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <IconComponent className="w-4 h-4 text-slate-600" />
                  <span className="font-medium text-slate-900">{category.label}</span>
                </div>
                <p className="text-sm text-slate-500">{category.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historical data preference */}
      <div className="pt-4 border-t border-slate-200">
        <Label className="text-sm font-medium text-slate-700 mb-3 block">
          Historical Data
        </Label>
        <RadioGroup
          value={data.historicalOption || 'active'}
          onValueChange={(value) => onChange({ ...data, historicalOption: value })}
          className="flex flex-wrap gap-4"
        >
          {HISTORICAL_OPTIONS.map(option => (
            <div key={option.id} className="flex items-center space-x-2">
              <RadioGroupItem value={option.id} id={option.id} />
              <Label htmlFor={option.id} className="cursor-pointer">
                <span className="font-medium">{option.label}</span>
                <span className="text-slate-500 ml-1">- {option.description}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

// Step 2: Set Priority Order
function PriorityStep({ data, onChange }) {
  const selectedCategories = data.selectedCategories || [];
  const priorityOrder = data.priorityOrder || selectedCategories;

  const moveUp = (index) => {
    if (index === 0) return;
    const newOrder = [...priorityOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    onChange({ ...data, priorityOrder: newOrder });
  };

  const moveDown = (index) => {
    if (index === priorityOrder.length - 1) return;
    const newOrder = [...priorityOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    onChange({ ...data, priorityOrder: newOrder });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Set Import Priority</h2>
        <p className="text-slate-500">
          Drag to reorder. Data will be processed in this order, with higher priority items imported first.
        </p>
      </div>

      <div className="space-y-2">
        {priorityOrder.map((categoryId, index) => {
          const category = CATEGORIES.find(c => c.id === categoryId);
          if (!category) return null;
          const IconComponent = category.icon;

          return (
            <div
              key={categoryId}
              className="flex items-center gap-3 p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300"
            >
              <div className="flex items-center gap-2 text-slate-400">
                <GripVertical className="w-4 h-4 cursor-grab" />
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600">
                  {index + 1}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-1">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <IconComponent className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <span className="font-medium text-slate-900">{category.label}</span>
                  <span className="text-sm text-slate-500 ml-2">{category.description}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                >
                  <ArrowLeft className="w-4 h-4 rotate-90" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => moveDown(index)}
                  disabled={index === priorityOrder.length - 1}
                >
                  <ArrowRight className="w-4 h-4 rotate-90" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Tip:</strong> Start with your most important data. You can always import more later.
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 3: Upload Data
function UploadStep({ data, onChange }) {
  const [files, setFiles] = useState([]);
  const [connectedProviders, setConnectedProviders] = useState([]);
  const [emailAddress] = useState('import-abc123@import.canonical.com'); // Mock

  const handleFilesSelected = (selectedFiles) => {
    setFiles(selectedFiles);
    onChange({ ...data, uploadedFiles: selectedFiles });
  };

  const handleOAuthConnect = (providerId) => {
    // Mock OAuth connection
    setConnectedProviders([...connectedProviders, providerId]);
    onChange({ ...data, connectedProviders: [...connectedProviders, providerId] });
  };

  const handleOAuthDisconnect = (providerId) => {
    const updated = connectedProviders.filter(p => p !== providerId);
    setConnectedProviders(updated);
    onChange({ ...data, connectedProviders: updated });
  };

  return (
    <IntakeChannelHub
      onFilesSelected={handleFilesSelected}
      onOAuthConnect={handleOAuthConnect}
      onOAuthDisconnect={handleOAuthDisconnect}
      connectedProviders={connectedProviders}
      emailAddress={emailAddress}
    />
  );
}

// Step 4: Confirm
function ConfirmStep({ data, isSubmitting, error }) {
  const selectedCategories = data.selectedCategories || [];
  const priorityOrder = data.priorityOrder || selectedCategories;
  const files = data.uploadedFiles || [];
  const connectedProviders = data.connectedProviders || [];

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <Send className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Ready to Import</h2>
        <p className="text-slate-500">Review your settings and start the import process.</p>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Data Types</span>
            <span className="font-medium">{selectedCategories.length} categories</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Files Uploaded</span>
            <span className="font-medium">{files.length} files</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Connected Accounts</span>
            <span className="font-medium">{connectedProviders.length} accounts</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Historical Data</span>
            <span className="font-medium capitalize">{data.historicalOption || 'Active only'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Priority order */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Processing Order</CardTitle>
          <CardDescription>Data will be imported in this order</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {priorityOrder.map((categoryId, index) => {
              const category = CATEGORIES.find(c => c.id === categoryId);
              return (
                <Badge key={categoryId} variant="secondary" className="gap-1">
                  <span className="text-xs text-slate-400">{index + 1}.</span>
                  {category?.label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Processing notice */}
      <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-600">
        <p>
          <strong>What happens next:</strong> Our AI will process your data and notify you when
          it's ready for review. You'll be able to verify everything before it goes live.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isSubmitting && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Starting import...
        </div>
      )}
    </div>
  );
}

export default function OrgOnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState('categories');
  const [formData, setFormData] = useState({
    selectedCategories: ['deals'], // Default to deals for vertical slice
    historicalOption: 'active',
    priorityOrder: null,
    uploadedFiles: [],
    connectedProviders: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'categories':
        return (formData.selectedCategories || []).length > 0;
      case 'priority':
        return true;
      case 'upload':
        const hasFiles = (formData.uploadedFiles || []).length > 0;
        const hasConnections = (formData.connectedProviders || []).length > 0;
        return hasFiles || hasConnections;
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const goNext = async () => {
    if (currentStep === 'categories' && !formData.priorityOrder) {
      // Initialize priority order from selected categories
      setFormData({
        ...formData,
        priorityOrder: formData.selectedCategories
      });
    }

    if (currentStep === 'confirm') {
      setIsSubmitting(true);
      setError(null);
      try {
        const data = await bff.onboarding.createSession({
          selectedCategories: formData.selectedCategories,
          categoryPriorities: formData.priorityOrder || formData.selectedCategories,
          historicalOption: formData.historicalOption,
          tier: 'SELF_SERVICE'
        });

        // Store session ID for subsequent pages
        const sessionId = data.session?.id || data.id;
        if (sessionId) {
          localStorage.setItem('onboarding_session_id', sessionId);
          navigate(`/onboarding/status?sessionId=${sessionId}`);
        } else {
          throw new Error('No session ID returned');
        }
      } catch (err) {
        console.error('Failed to start import:', err);
        setError(err.message || 'Failed to create onboarding session');
        setIsSubmitting(false);
      }
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Import Your Data</h1>
            <p className="text-sm text-slate-500">Step {currentStepIndex + 1} of {STEPS.length}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} steps={STEPS} />

        {/* Step Content */}
        <Card className="mb-6">
          <CardContent className="p-6">
            {currentStep === 'categories' && (
              <CategoriesStep data={formData} onChange={setFormData} />
            )}
            {currentStep === 'priority' && (
              <PriorityStep data={formData} onChange={setFormData} />
            )}
            {currentStep === 'upload' && (
              <UploadStep data={formData} onChange={setFormData} />
            )}
            {currentStep === 'confirm' && (
              <ConfirmStep data={formData} isSubmitting={isSubmitting} error={error} />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={goBack} disabled={isSubmitting}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={goNext}
            disabled={!canProceed() || isSubmitting}
          >
            {currentStep === 'confirm' ? (
              <>
                <Send className="h-4 w-4 mr-2" />
                Start Import
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
