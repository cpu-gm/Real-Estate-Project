import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  FileText,
  FileSpreadsheet,
  Image,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Edit2,
  X,
  Save,
  ExternalLink,
  Info
} from 'lucide-react';

// Confidence level styling
const CONFIDENCE_STYLES = {
  high: { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'High' },
  medium: { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Medium' },
  low: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Low' }
};

function getConfidenceLevel(confidence) {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

// Source Document Viewer Component
function SourceDocumentViewer({
  source,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  highlightedRegion = null,
  zoom = 100,
  onZoomChange
}) {
  const getFileIcon = () => {
    if (source?.type === 'pdf') return <FileText className="w-5 h-5" />;
    if (source?.type === 'excel') return <FileSpreadsheet className="w-5 h-5" />;
    if (source?.type === 'image') return <Image className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{getFileIcon()}</span>
          <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">
            {source?.fileName || 'Source Document'}
          </span>
          {source?.type === 'excel' && source?.sheetName && (
            <Badge variant="outline" className="text-xs">
              {source.sheetName}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onZoomChange?.(Math.max(50, zoom - 25))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-500 w-12 text-center">{zoom}%</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onZoomChange?.(Math.min(200, zoom + 25))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Document content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {source?.type === 'text' || source?.type === 'excel' ? (
            /* Text/table content preview */
            <div
              className="font-mono text-sm whitespace-pre-wrap bg-white p-4 rounded-lg border"
              style={{ fontSize: `${zoom / 100}em` }}
            >
              {source?.content || 'No content available'}
              {highlightedRegion && (
                <mark className="bg-yellow-200 px-1 rounded">
                  {highlightedRegion.text}
                </mark>
              )}
            </div>
          ) : source?.type === 'pdf' || source?.type === 'image' ? (
            /* Image/PDF preview placeholder */
            <div className="aspect-[8.5/11] bg-slate-100 rounded-lg flex items-center justify-center">
              <div className="text-center text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Document preview</p>
                <p className="text-xs text-slate-400">Page {currentPage}</p>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
              No source document
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Page navigation (for multi-page docs) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-slate-200 bg-slate-50">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage <= 1}
            onClick={() => onPageChange?.(currentPage - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange?.(currentPage + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Provenance Indicator (hover/click to reveal)
function ProvenanceIndicator({ provenance, confidence, onClick }) {
  const level = getConfidenceLevel(confidence);
  const styles = CONFIDENCE_STYLES[level];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors",
              styles.bg, styles.color, "hover:opacity-80"
            )}
            onClick={onClick}
          >
            <Info className="w-3 h-3" />
            <span>{Math.round(confidence * 100)}%</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs space-y-1">
            <div className="font-medium">Source: {provenance?.documentName || 'Unknown'}</div>
            {provenance?.pageNumber && <div>Page {provenance.pageNumber}</div>}
            {provenance?.cellReference && <div>Cell: {provenance.cellReference}</div>}
            {provenance?.textSnippet && (
              <div className="text-slate-400 italic truncate">
                "{provenance.textSnippet}"
              </div>
            )}
            <div className="text-slate-500">Click to view in source</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Single field row in the interpreted data panel
function InterpretedField({
  field,
  value,
  displayValue,
  confidence,
  provenance,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onChange,
  editValue,
  onProvenanceClick
}) {
  const level = getConfidenceLevel(confidence);
  const styles = CONFIDENCE_STYLES[level];

  return (
    <div className={cn(
      "p-3 rounded-lg border transition-colors",
      isEditing ? "border-blue-300 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Label className="text-xs text-slate-500 mb-1 block">
            {field.label}
          </Label>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => onChange?.(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onSave}>
                <Save className="w-4 h-4 text-green-600" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onCancel}>
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">
                {displayValue || value || '—'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={onEdit}
              >
                <Edit2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ProvenanceIndicator
            provenance={provenance}
            confidence={confidence}
            onClick={onProvenanceClick}
          />
        </div>
      </div>

      {/* Show confidence warning for low confidence */}
      {level === 'low' && !isEditing && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
          <AlertTriangle className="w-3 h-3" />
          Low confidence - please verify
        </div>
      )}
    </div>
  );
}

// Interpreted Data Panel Component
function InterpretedDataPanel({
  record,
  fields = [],
  onFieldEdit,
  onFieldSave,
  onProvenanceClick,
  editingField = null,
  editValue = ''
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-slate-900">Interpreted Data</h3>
            <p className="text-xs text-slate-500">
              {fields.length} fields extracted
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {record?.category || 'Deal'}
          </Badge>
        </div>
      </div>

      {/* Fields list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {fields.map((field) => (
            <div key={field.id} className="group">
              <InterpretedField
                field={field}
                value={field.value}
                displayValue={field.displayValue}
                confidence={field.confidence}
                provenance={field.provenance}
                isEditing={editingField === field.id}
                editValue={editingField === field.id ? editValue : field.value}
                onEdit={() => onFieldEdit?.(field.id, field.value)}
                onSave={() => onFieldSave?.(field.id)}
                onCancel={() => onFieldEdit?.(null)}
                onChange={(val) => onFieldEdit?.(field.id, val)}
                onProvenanceClick={() => onProvenanceClick?.(field)}
              />
            </div>
          ))}

          {fields.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-500">
              <HelpCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>No fields extracted yet</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Main Split Review Panel
export default function SplitReviewPanel({
  record,
  source,
  fields = [],
  onFieldEdit,
  onFieldSave,
  onApprove,
  onReject,
  onSkip,
  currentIndex,
  totalRecords,
  onNavigate,
  className
}) {
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [highlightedProvenance, setHighlightedProvenance] = useState(null);

  const handleFieldEdit = (fieldId, value) => {
    if (fieldId === null) {
      setEditingField(null);
      setEditValue('');
    } else {
      setEditingField(fieldId);
      setEditValue(value || '');
    }
  };

  const handleFieldSave = (fieldId) => {
    onFieldSave?.(fieldId, editValue);
    setEditingField(null);
    setEditValue('');
  };

  const handleProvenanceClick = (field) => {
    // Highlight the source in the document viewer
    setHighlightedProvenance(field.provenance);
    if (field.provenance?.pageNumber) {
      setCurrentPage(field.provenance.pageNumber);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-white rounded-lg border border-slate-200 overflow-hidden", className)}>
      {/* Navigation header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentIndex <= 0}
            onClick={() => onNavigate?.(currentIndex - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-slate-600">
            Record {currentIndex + 1} of {totalRecords}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentIndex >= totalRecords - 1}
            onClick={() => onNavigate?.(currentIndex + 1)}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <Button variant="outline" size="sm" onClick={onReject} className="text-red-600 hover:text-red-700">
            <X className="w-4 h-4 mr-1" />
            Reject
          </Button>
          <Button size="sm" onClick={onApprove} className="bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Approve
          </Button>
        </div>
      </div>

      {/* Split panels */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left panel: Source document */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <SourceDocumentViewer
            source={source}
            currentPage={currentPage}
            totalPages={source?.totalPages || 1}
            onPageChange={setCurrentPage}
            highlightedRegion={highlightedProvenance}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: Interpreted data */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <InterpretedDataPanel
            record={record}
            fields={fields}
            editingField={editingField}
            editValue={editValue}
            onFieldEdit={handleFieldEdit}
            onFieldSave={handleFieldSave}
            onProvenanceClick={handleProvenanceClick}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
