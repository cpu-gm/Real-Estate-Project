import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, XCircle, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';

const SEVERITY_CONFIG = {
  CRITICAL: {
    icon: XCircle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    iconColor: 'text-red-500',
    label: 'Critical'
  },
  ERROR: {
    icon: AlertCircle,
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    iconColor: 'text-orange-500',
    label: 'Error'
  },
  WARNING: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    iconColor: 'text-yellow-500',
    label: 'Warning'
  },
  INFO: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    iconColor: 'text-blue-500',
    label: 'Info'
  }
};

/**
 * Displays playbook compliance check results
 */
export default function PlaybookViolationList({
  violations = [],
  playbookScore,
  playbookName,
  onViewRule
}) {
  const [expandedId, setExpandedId] = useState(null);

  // Group violations by severity
  const groupedViolations = violations.reduce((acc, v) => {
    const severity = v.severity || 'WARNING';
    if (!acc[severity]) acc[severity] = [];
    acc[severity].push(v);
    return acc;
  }, {});

  const severityOrder = ['CRITICAL', 'ERROR', 'WARNING', 'INFO'];
  const sortedSeverities = severityOrder.filter(s => groupedViolations[s]?.length > 0);

  // Calculate compliance status
  const isCompliant = violations.length === 0;
  const hasErrors = groupedViolations.CRITICAL?.length > 0 || groupedViolations.ERROR?.length > 0;

  return (
    <div className="space-y-4">
      {/* Header with score */}
      <div className={`p-4 rounded-lg border ${isCompliant ? 'bg-green-50 border-green-200' : hasErrors ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isCompliant ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : hasErrors ? (
              <XCircle className="w-6 h-6 text-red-500" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            )}
            <div>
              <h3 className="font-medium text-gray-900">
                {playbookName || 'Playbook'} Compliance
              </h3>
              <p className="text-sm text-gray-500">
                {isCompliant
                  ? 'All rules passed'
                  : `${violations.length} issue${violations.length !== 1 ? 's' : ''} found`}
              </p>
            </div>
          </div>
          {typeof playbookScore === 'number' && (
            <div className="text-right">
              <div className={`text-2xl font-bold ${playbookScore >= 80 ? 'text-green-600' : playbookScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                {playbookScore}%
              </div>
              <div className="text-xs text-gray-500">Compliance Score</div>
            </div>
          )}
        </div>
      </div>

      {/* Violation Summary */}
      {!isCompliant && (
        <div className="flex items-center space-x-4 text-sm">
          {sortedSeverities.map(severity => {
            const config = SEVERITY_CONFIG[severity];
            const Icon = config.icon;
            return (
              <div key={severity} className="flex items-center space-x-1">
                <Icon className={`w-4 h-4 ${config.iconColor}`} />
                <span className={config.text}>
                  {groupedViolations[severity].length} {config.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Violations List */}
      {!isCompliant && (
        <div className="space-y-2">
          {violations.map((violation, index) => {
            const config = SEVERITY_CONFIG[violation.severity] || SEVERITY_CONFIG.WARNING;
            const Icon = config.icon;
            const isExpanded = expandedId === index;

            return (
              <div
                key={index}
                className={`rounded-md border ${config.bg} ${config.border}`}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : index)}
                  className="w-full px-4 py-3 flex items-start justify-between text-left"
                >
                  <div className="flex items-start space-x-3">
                    <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
                    <div>
                      <p className={`font-medium ${config.text}`}>
                        {violation.ruleName || violation.clause || 'Rule Violation'}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {violation.failureMessage || violation.issue}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 ml-8 space-y-3">
                    {violation.clauseCategory && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Category</span>
                        <p className="text-sm text-gray-700">{violation.clauseCategory}</p>
                      </div>
                    )}
                    {violation.matchedText && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Found Text</span>
                        <p className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-200 mt-1">
                          "{violation.matchedText}"
                        </p>
                      </div>
                    )}
                    {violation.suggestedFix && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Suggested Fix</span>
                        <p className="text-sm text-gray-700">{violation.suggestedFix}</p>
                      </div>
                    )}
                    {onViewRule && violation.ruleId && (
                      <button
                        onClick={() => onViewRule(violation.ruleId)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        View Rule Details →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Compact violation badge for lists
 */
export function ViolationBadge({ count, maxSeverity }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3 mr-1" />
        Compliant
      </span>
    );
  }

  const config = SEVERITY_CONFIG[maxSeverity] || SEVERITY_CONFIG.WARNING;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3 mr-1" />
      {count} Issue{count !== 1 ? 's' : ''}
    </span>
  );
}
