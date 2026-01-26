import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Edit3
} from 'lucide-react';

/**
 * ConflictResolutionPanel - Display and resolve data conflicts
 *
 * Shows when multiple sources disagree on a field value.
 * Displays AI suggestion with rationale and allows user to:
 * - Accept AI suggestion
 * - Choose Source A or Source B
 * - Enter custom value
 */
export function ConflictResolutionPanel({
  conflict,
  onResolve,
  onSkip,
  onViewSource,
  className = ''
}) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [customValue, setCustomValue] = useState('');
  const [showRationale, setShowRationale] = useState(true);
  const [isResolving, setIsResolving] = useState(false);

  if (!conflict) return null;

  const {
    id,
    fieldPath,
    fieldLabel,
    claimA,
    claimB,
    aiSuggestedValue,
    aiRationale,
    aiConfidence
  } = conflict;

  const handleResolve = async () => {
    if (!selectedOption) return;

    setIsResolving(true);

    let resolvedValue;
    let resolutionMethod;

    switch (selectedOption) {
      case 'ai':
        resolvedValue = aiSuggestedValue;
        resolutionMethod = 'AI_SUGGESTION';
        break;
      case 'sourceA':
        resolvedValue = claimA.value;
        resolutionMethod = 'SOURCE_A';
        break;
      case 'sourceB':
        resolvedValue = claimB.value;
        resolutionMethod = 'SOURCE_B';
        break;
      case 'custom':
        resolvedValue = customValue;
        resolutionMethod = 'CUSTOM';
        break;
      default:
        return;
    }

    try {
      await onResolve?.(id, resolutionMethod, resolvedValue);
    } finally {
      setIsResolving(false);
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <Card className={`border-amber-200 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Conflict Detected</CardTitle>
              <CardDescription>
                Multiple sources disagree on: <strong>{fieldLabel || fieldPath}</strong>
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            Needs Resolution
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* AI Suggestion */}
        {aiSuggestedValue && (
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-blue-900">AI Recommendation</span>
                  <Badge className={getConfidenceColor(aiConfidence)}>
                    {Math.round((aiConfidence || 0) * 100)}% confident
                  </Badge>
                </div>
                <p className="text-lg font-semibold text-blue-900 mb-2">
                  {aiSuggestedValue}
                </p>
                {aiRationale && (
                  <div>
                    <button
                      onClick={() => setShowRationale(!showRationale)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <Lightbulb className="w-4 h-4" />
                      {showRationale ? 'Hide' : 'Show'} reasoning
                      {showRationale ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showRationale && (
                      <p className="mt-2 text-sm text-blue-700 bg-blue-100 rounded p-2">
                        {aiRationale}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Source Options */}
        <RadioGroup value={selectedOption} onValueChange={setSelectedOption}>
          {/* AI Suggestion Option */}
          {aiSuggestedValue && (
            <div className={`flex items-start space-x-3 p-3 rounded-lg border ${
              selectedOption === 'ai' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
            }`}>
              <RadioGroupItem value="ai" id="option-ai" className="mt-1" />
              <Label htmlFor="option-ai" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Use AI suggestion</span>
                </div>
                <p className="text-sm text-slate-600">{aiSuggestedValue}</p>
              </Label>
            </div>
          )}

          {/* Source A Option */}
          <div className={`flex items-start space-x-3 p-3 rounded-lg border ${
            selectedOption === 'sourceA' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
          }`}>
            <RadioGroupItem value="sourceA" id="option-a" className="mt-1" />
            <Label htmlFor="option-a" className="flex-1 cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Source A: {claimA?.documentName}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {Math.round((claimA?.confidence || 0) * 100)}%
                </Badge>
              </div>
              <p className="text-sm text-slate-600">{claimA?.value}</p>
              {claimA?.textSnippet && (
                <p className="mt-1 text-xs text-slate-400 italic">
                  "{claimA.textSnippet.slice(0, 100)}..."
                </p>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onViewSource?.(claimA);
                }}
                className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                View source <ExternalLink className="w-3 h-3" />
              </button>
            </Label>
          </div>

          {/* Source B Option */}
          <div className={`flex items-start space-x-3 p-3 rounded-lg border ${
            selectedOption === 'sourceB' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
          }`}>
            <RadioGroupItem value="sourceB" id="option-b" className="mt-1" />
            <Label htmlFor="option-b" className="flex-1 cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Source B: {claimB?.documentName}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {Math.round((claimB?.confidence || 0) * 100)}%
                </Badge>
              </div>
              <p className="text-sm text-slate-600">{claimB?.value}</p>
              {claimB?.textSnippet && (
                <p className="mt-1 text-xs text-slate-400 italic">
                  "{claimB.textSnippet.slice(0, 100)}..."
                </p>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onViewSource?.(claimB);
                }}
                className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                View source <ExternalLink className="w-3 h-3" />
              </button>
            </Label>
          </div>

          {/* Custom Value Option */}
          <div className={`flex items-start space-x-3 p-3 rounded-lg border ${
            selectedOption === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
          }`}>
            <RadioGroupItem value="custom" id="option-custom" className="mt-1" />
            <Label htmlFor="option-custom" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <Edit3 className="w-4 h-4 text-slate-500" />
                <span className="font-medium">Enter custom value</span>
              </div>
              {selectedOption === 'custom' && (
                <Input
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder="Enter the correct value..."
                  className="mt-1"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </Label>
          </div>
        </RadioGroup>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <Button
            variant="ghost"
            onClick={onSkip}
            disabled={isResolving}
          >
            Skip for now
          </Button>
          <Button
            onClick={handleResolve}
            disabled={!selectedOption || (selectedOption === 'custom' && !customValue) || isResolving}
          >
            {isResolving ? (
              <>Resolving...</>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Resolve Conflict
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ConflictList - Display list of conflicts for a session
 */
export function ConflictList({
  conflicts = [],
  onSelectConflict,
  selectedConflictId,
  className = ''
}) {
  if (conflicts.length === 0) {
    return (
      <div className={`text-center py-8 text-slate-500 ${className}`}>
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-300" />
        <p className="font-medium">No conflicts detected</p>
        <p className="text-sm">All extracted data is consistent</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-slate-900">
          Conflicts ({conflicts.length})
        </h3>
        <Badge variant="outline" className="text-amber-600">
          {conflicts.filter(c => c.status === 'UNRESOLVED').length} pending
        </Badge>
      </div>

      {conflicts.map((conflict) => (
        <button
          key={conflict.id}
          onClick={() => onSelectConflict?.(conflict)}
          className={`w-full text-left p-3 rounded-lg border transition-colors ${
            selectedConflictId === conflict.id
              ? 'border-blue-500 bg-blue-50'
              : conflict.status === 'UNRESOLVED'
              ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
              : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {conflict.status === 'UNRESOLVED' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              <span className="font-medium text-sm">
                {conflict.fieldLabel || conflict.fieldPath}
              </span>
            </div>
            <Badge
              variant="outline"
              className={conflict.status === 'UNRESOLVED' ? 'text-amber-600' : 'text-green-600'}
            >
              {conflict.status === 'UNRESOLVED' ? 'Pending' : 'Resolved'}
            </Badge>
          </div>
          <div className="mt-2 text-xs text-slate-500 grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-400">A:</span> {conflict.claimA?.value?.slice(0, 30)}...
            </div>
            <div>
              <span className="text-slate-400">B:</span> {conflict.claimB?.value?.slice(0, 30)}...
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * ConflictSummary - Summary stats for conflicts in a session
 */
export function ConflictSummary({ conflicts = [], className = '' }) {
  const total = conflicts.length;
  const unresolved = conflicts.filter(c => c.status === 'UNRESOLVED').length;
  const resolved = total - unresolved;
  const aiSuggested = conflicts.filter(c => c.aiSuggestedValue).length;

  if (total === 0) {
    return (
      <div className={`flex items-center gap-2 text-green-600 ${className}`}>
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-sm">No conflicts</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 text-sm ${className}`}>
      <div className="flex items-center gap-1">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <span className="text-amber-700">{unresolved} pending</span>
      </div>
      <div className="flex items-center gap-1">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        <span className="text-green-700">{resolved} resolved</span>
      </div>
      {aiSuggested > 0 && (
        <div className="flex items-center gap-1">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-blue-700">{aiSuggested} AI suggestions</span>
        </div>
      )}
    </div>
  );
}

export default ConflictResolutionPanel;
