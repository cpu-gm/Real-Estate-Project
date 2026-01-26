import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sparkles,
  MessageSquare,
  FileSearch,
  BarChart3,
  Shield,
  Loader2
} from 'lucide-react';

const AI_FEATURES = [
  {
    id: 'allowDealParsing',
    label: 'Deal Parsing',
    description: 'Extract deal information from documents and emails automatically',
    icon: FileSearch
  },
  {
    id: 'allowChatAssistant',
    label: 'Chat Assistant',
    description: 'Ask questions about deals and get AI-powered answers',
    icon: MessageSquare
  },
  {
    id: 'allowDocumentAnalysis',
    label: 'Document Analysis',
    description: 'Analyze documents for key terms, risks, and insights',
    icon: FileSearch
  },
  {
    id: 'allowInsights',
    label: 'AI Insights',
    description: 'Get automated analysis and recommendations for deals',
    icon: BarChart3
  }
];

/**
 * Modal for granting AI feature consent.
 * Displays feature descriptions and allows granular opt-in.
 */
export function AIConsentModal({ open, onOpenChange, onConsent, isGranting = false }) {
  const [features, setFeatures] = useState({
    allowDealParsing: true,
    allowChatAssistant: true,
    allowDocumentAnalysis: true,
    allowInsights: true
  });

  const toggleFeature = (featureId) => {
    setFeatures(prev => ({
      ...prev,
      [featureId]: !prev[featureId]
    }));
  };

  const handleGrant = async () => {
    try {
      await onConsent(features);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to grant consent:', error);
    }
  };

  const allSelected = Object.values(features).every(Boolean);
  const noneSelected = Object.values(features).every(v => !v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Enable AI Features
          </DialogTitle>
          <DialogDescription>
            Select which AI-powered features you would like to enable.
            You can change these settings at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {AI_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => toggleFeature(feature.id)}
              >
                <Checkbox
                  id={feature.id}
                  checked={features[feature.id]}
                  onCheckedChange={() => toggleFeature(feature.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={feature.id}
                    className="flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-purple-600" />
                    {feature.label}
                  </Label>
                  <p className="text-xs text-gray-500 mt-1">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm">
          <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <p className="text-blue-800">
            Your data is processed securely and never shared with third parties.
            You can withdraw consent at any time from Settings.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGranting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGrant}
            disabled={noneSelected || isGranting}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isGranting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Enable {allSelected ? 'All' : 'Selected'} Features
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AIConsentModal;
