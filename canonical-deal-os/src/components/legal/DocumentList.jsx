import React from 'react';
import { FileText, Eye, Trash2, Brain, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import RiskScoreBadge from './RiskScoreBadge';

const STATUS_STYLES = {
  UPLOADED: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100', label: 'Uploaded' },
  ANALYZING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Analyzing', animate: true },
  ANALYZED: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', label: 'Analyzed' },
  FAILED: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100', label: 'Failed' }
};

const DOCUMENT_TYPE_LABELS = {
  CONTRACT: 'Contract',
  LEASE: 'Lease',
  PSA: 'PSA',
  LOI: 'LOI',
  AMENDMENT: 'Amendment',
  SIDE_LETTER: 'Side Letter',
  OPERATING_AGREEMENT: 'Operating Agreement',
  TITLE_DOCUMENT: 'Title',
  INSURANCE: 'Insurance',
  ENVIRONMENTAL: 'Environmental',
  SURVEY: 'Survey',
  OTHER: 'Other'
};

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentList({
  documents = [],
  onView,
  onAnalyze,
  onDelete,
  isLoading = false,
  emptyMessage = 'No documents yet'
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {documents.map((doc) => {
        const statusConfig = STATUS_STYLES[doc.status] || STATUS_STYLES.UPLOADED;
        const StatusIcon = statusConfig.icon;

        return (
          <div key={doc.id} className="py-4 flex items-center justify-between hover:bg-gray-50 px-2 -mx-2 rounded">
            <div className="flex items-center space-x-4 min-w-0 flex-1">
              {/* File Icon */}
              <div className="flex-shrink-0">
                <FileText className="w-8 h-8 text-blue-500" />
              </div>

              {/* Document Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {doc.filename}
                  </h4>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                    {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                  </span>
                </div>
                <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                  <span>{formatFileSize(doc.sizeBytes)}</span>
                  <span>·</span>
                  <span>{formatDate(doc.uploadedAt)}</span>
                  {doc.uploadedByName && (
                    <>
                      <span>·</span>
                      <span>{doc.uploadedByName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className={`flex items-center space-x-1 px-2 py-1 rounded-full ${statusConfig.bg}`}>
                <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.color} ${statusConfig.animate ? 'animate-spin' : ''}`} />
                <span className={`text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>

              {/* Risk Score (if analyzed) */}
              {doc.status === 'ANALYZED' && doc.analyses?.[0]?.riskScore && (
                <RiskScoreBadge score={doc.analyses[0].riskScore} />
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2 ml-4">
              {onView && (
                <button
                  onClick={() => onView(doc)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="View document"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              {onAnalyze && doc.status !== 'ANALYZING' && (
                <button
                  onClick={() => onAnalyze(doc)}
                  className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                  title={doc.status === 'ANALYZED' ? 'Re-analyze' : 'Analyze with AI'}
                >
                  <Brain className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(doc)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
