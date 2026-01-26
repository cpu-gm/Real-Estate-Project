import React from 'react';
import { FileText, Calendar, Users, DollarSign, Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { RiskScoreDisplay } from './RiskScoreBadge';

/**
 * AI Analysis Summary Card
 * Displays the extracted terms, summary, and risk assessment from document analysis
 */
export default function AnalysisSummaryCard({ analysis, onViewDetails }) {
  if (!analysis) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No analysis available</p>
        <p className="text-sm text-gray-400 mt-1">Click "Analyze" to process this document with AI</p>
      </div>
    );
  }

  // Parse JSON fields if they're strings
  const extractedTerms = typeof analysis.extractedTerms === 'string'
    ? JSON.parse(analysis.extractedTerms)
    : analysis.extractedTerms;

  const identifiedClauses = typeof analysis.identifiedClauses === 'string'
    ? JSON.parse(analysis.identifiedClauses)
    : analysis.identifiedClauses;

  const missingClauses = typeof analysis.missingClauses === 'string'
    ? JSON.parse(analysis.missingClauses)
    : analysis.missingClauses;

  const unusualClauses = typeof analysis.unusualClauses === 'string'
    ? JSON.parse(analysis.unusualClauses)
    : analysis.unusualClauses;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">AI Analysis Summary</h3>
          <span className="text-xs text-gray-500">
            Analyzed {new Date(analysis.analyzedAt).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Risk Score */}
        <RiskScoreDisplay
          score={analysis.riskScore}
          explanation={analysis.riskExplanation}
        />

        {/* Executive Summary */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Executive Summary</h4>
          <div className="prose prose-sm max-w-none text-gray-600">
            {analysis.summary}
          </div>
        </div>

        {/* Key Terms Grid */}
        {extractedTerms && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Key Terms Extracted</h4>
            <div className="grid grid-cols-2 gap-4">
              {extractedTerms.parties && (
                <TermItem
                  icon={Users}
                  label="Parties"
                  value={Array.isArray(extractedTerms.parties)
                    ? extractedTerms.parties.join(', ')
                    : extractedTerms.parties}
                />
              )}
              {extractedTerms.effectiveDate && (
                <TermItem
                  icon={Calendar}
                  label="Effective Date"
                  value={extractedTerms.effectiveDate}
                />
              )}
              {extractedTerms.expirationDate && (
                <TermItem
                  icon={Clock}
                  label="Expiration"
                  value={extractedTerms.expirationDate}
                />
              )}
              {extractedTerms.purchasePrice && (
                <TermItem
                  icon={DollarSign}
                  label="Purchase Price"
                  value={typeof extractedTerms.purchasePrice === 'number'
                    ? `$${extractedTerms.purchasePrice.toLocaleString()}`
                    : extractedTerms.purchasePrice}
                />
              )}
              {extractedTerms.earnestMoney && (
                <TermItem
                  icon={DollarSign}
                  label="Earnest Money"
                  value={typeof extractedTerms.earnestMoney === 'number'
                    ? `$${extractedTerms.earnestMoney.toLocaleString()}`
                    : extractedTerms.earnestMoney}
                />
              )}
              {extractedTerms.ddPeriod && (
                <TermItem
                  icon={Clock}
                  label="DD Period"
                  value={extractedTerms.ddPeriod}
                />
              )}
            </div>
          </div>
        )}

        {/* Flags Section */}
        <div className="space-y-4">
          {/* Missing Clauses */}
          {missingClauses && missingClauses.length > 0 && (
            <FlagSection
              icon={AlertTriangle}
              title="Missing Standard Clauses"
              items={missingClauses}
              type="warning"
              renderItem={(clause) => (
                <div key={clause.clause}>
                  <span className="font-medium">{clause.clause}</span>
                  {clause.suggestion && (
                    <p className="text-xs text-gray-500 mt-0.5">{clause.suggestion}</p>
                  )}
                </div>
              )}
            />
          )}

          {/* Unusual Clauses */}
          {unusualClauses && unusualClauses.length > 0 && (
            <FlagSection
              icon={Info}
              title="Unusual Clauses"
              items={unusualClauses}
              type="info"
              renderItem={(clause) => (
                <div key={clause.clause}>
                  <span className="font-medium">{clause.clause}</span>
                  {clause.concern && (
                    <p className="text-xs text-gray-500 mt-0.5">{clause.concern}</p>
                  )}
                </div>
              )}
            />
          )}

          {/* Identified Clauses Summary */}
          {identifiedClauses && identifiedClauses.length > 0 && (
            <FlagSection
              icon={CheckCircle}
              title={`${identifiedClauses.length} Clauses Identified`}
              items={identifiedClauses.slice(0, 5)}
              type="success"
              renderItem={(clause) => (
                <span key={clause.type} className="text-sm">{clause.type}</span>
              )}
              collapsed={identifiedClauses.length > 5}
              collapsedLabel={`+${identifiedClauses.length - 5} more`}
            />
          )}
        </div>

        {/* View Details Button */}
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="w-full py-2 px-4 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
          >
            View Full Analysis
          </button>
        )}
      </div>
    </div>
  );
}

function TermItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start space-x-2 p-3 bg-gray-50 rounded-md">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

function FlagSection({ icon: Icon, title, items, type, renderItem, collapsed, collapsedLabel }) {
  const typeConfig = {
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-500' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500' },
    success: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-500' },
    error: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500' }
  };

  const config = typeConfig[type] || typeConfig.info;

  return (
    <div className={`p-3 rounded-md border ${config.bg} ${config.border}`}>
      <div className="flex items-center space-x-2 mb-2">
        <Icon className={`w-4 h-4 ${config.icon}`} />
        <span className="text-sm font-medium text-gray-900">{title}</span>
      </div>
      <div className="space-y-1.5 ml-6">
        {items.map(renderItem)}
        {collapsed && collapsedLabel && (
          <span className="text-xs text-gray-500">{collapsedLabel}</span>
        )}
      </div>
    </div>
  );
}
