import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  Edit2,
  Save,
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  Info,
  Flag,
  Briefcase,
  Users,
  Building2,
  DollarSign
} from 'lucide-react';

// Category icons
const CATEGORY_ICONS = {
  deal: Briefcase,
  contact: Users,
  property: Building2,
  financial: DollarSign,
  document: FileText
};

// Confidence styling
const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-red-100 text-red-700 border-red-200'
};

function getConfidenceLevel(confidence) {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

// Provenance badge with hover details
function ProvenanceBadge({ provenance, confidence, onViewSource }) {
  const level = getConfidenceLevel(confidence);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-opacity hover:opacity-80",
              CONFIDENCE_COLORS[level]
            )}
            onClick={onViewSource}
          >
            <Info className="w-3 h-3" />
            {Math.round(confidence * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-500">Source:</span>{' '}
              <span className="font-medium">{provenance?.documentName || 'Unknown'}</span>
            </div>
            {provenance?.pageNumber && (
              <div>
                <span className="text-slate-500">Page:</span> {provenance.pageNumber}
              </div>
            )}
            {provenance?.cellReference && (
              <div>
                <span className="text-slate-500">Cell:</span> {provenance.cellReference}
              </div>
            )}
            {provenance?.extractionMethod && (
              <div>
                <span className="text-slate-500">Method:</span> {provenance.extractionMethod}
              </div>
            )}
            {provenance?.textSnippet && (
              <div className="mt-2 p-2 bg-slate-100 rounded text-slate-600 italic">
                "{provenance.textSnippet}"
              </div>
            )}
            <div className="pt-2 text-slate-400 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              Click to view in source
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Single field display with edit capability
function FieldRow({ field, isEditing, editValue, onEdit, onSave, onCancel, onChange, onViewSource }) {
  const level = getConfidenceLevel(field.confidence);
  const needsAttention = level === 'low';

  return (
    <div className={cn(
      "flex items-start gap-3 py-2 px-3 rounded-lg transition-colors",
      isEditing && "bg-blue-50",
      needsAttention && !isEditing && "bg-amber-50/50"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-slate-500">{field.label}</span>
          {needsAttention && (
            <AlertTriangle className="w-3 h-3 text-amber-500" />
          )}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              value={editValue}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onSave}>
              <Save className="w-4 h-4 text-green-600" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <span className="text-sm font-medium text-slate-900">
              {field.displayValue || field.value || '—'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onEdit}
            >
              <Edit2 className="w-3 h-3 text-slate-400" />
            </Button>
          </div>
        )}
      </div>

      <ProvenanceBadge
        provenance={field.provenance}
        confidence={field.confidence}
        onViewSource={() => onViewSource?.(field)}
      />
    </div>
  );
}

export default function RecordReviewCard({
  record,
  fields = [],
  status = 'pending', // pending, approved, rejected, flagged
  isExpanded = false,
  onToggleExpand,
  onApprove,
  onReject,
  onFlag,
  onFieldEdit,
  onViewSource,
  className
}) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Calculate record stats
  const avgConfidence = fields.length > 0
    ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
    : 0;
  const lowConfidenceCount = fields.filter(f => f.confidence < 0.7).length;
  const confidenceLevel = getConfidenceLevel(avgConfidence);

  const CategoryIcon = CATEGORY_ICONS[record?.category?.toLowerCase()] || FileText;

  const handleEdit = (fieldId, value) => {
    setEditingField(fieldId);
    setEditValue(value || '');
  };

  const handleSave = (fieldId) => {
    onFieldEdit?.(record.id, fieldId, editValue);
    setEditingField(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      status === 'approved' && "border-green-200 bg-green-50/30",
      status === 'rejected' && "border-red-200 bg-red-50/30",
      status === 'flagged' && "border-amber-200 bg-amber-50/30",
      className
    )}>
      {/* Collapsed header - always visible */}
      <div
        className={cn(
          "flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors",
          isExpanded && "border-b border-slate-100"
        )}
        onClick={onToggleExpand}
      >
        {/* Status indicator */}
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
          status === 'approved' && "bg-green-100",
          status === 'rejected' && "bg-red-100",
          status === 'flagged' && "bg-amber-100",
          status === 'pending' && "bg-slate-100"
        )}>
          {status === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
          {status === 'rejected' && <X className="w-5 h-5 text-red-600" />}
          {status === 'flagged' && <Flag className="w-5 h-5 text-amber-600" />}
          {status === 'pending' && <CategoryIcon className="w-5 h-5 text-slate-500" />}
        </div>

        {/* Record info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-slate-900 truncate">
              {record?.title || record?.name || `Record #${record?.id}`}
            </span>
            <Badge variant="outline" className="text-xs capitalize shrink-0">
              {record?.category || 'Unknown'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{fields.length} fields</span>
            <span>•</span>
            <span className={cn(
              confidenceLevel === 'high' && "text-green-600",
              confidenceLevel === 'medium' && "text-amber-600",
              confidenceLevel === 'low' && "text-red-600"
            )}>
              {Math.round(avgConfidence * 100)}% confidence
            </span>
            {lowConfidenceCount > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {lowConfidenceCount} need review
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick actions (visible on hover) */}
        {status === 'pending' && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-100"
              onClick={(e) => { e.stopPropagation(); onFlag?.(); }}
            >
              <Flag className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
              onClick={(e) => { e.stopPropagation(); onReject?.(); }}
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
              onClick={(e) => { e.stopPropagation(); onApprove?.(); }}
            >
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Expand toggle */}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {fields.map(field => (
              <FieldRow
                key={field.id}
                field={field}
                isEditing={editingField === field.id}
                editValue={editingField === field.id ? editValue : field.value}
                onEdit={() => handleEdit(field.id, field.value)}
                onSave={() => handleSave(field.id)}
                onCancel={handleCancel}
                onChange={setEditValue}
                onViewSource={onViewSource}
              />
            ))}
          </div>

          {/* Action buttons */}
          {status === 'pending' && (
            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={onFlag}>
                <Flag className="w-4 h-4 mr-1" />
                Flag for Review
              </Button>
              <Button variant="outline" size="sm" onClick={onReject} className="text-red-600">
                <X className="w-4 h-4 mr-1" />
                Reject
              </Button>
              <Button size="sm" onClick={onApprove} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Approve
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
