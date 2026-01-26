import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, HelpCircle } from 'lucide-react';

const RULE_TYPES = [
  { value: 'MUST_HAVE', label: 'Must Have', description: 'Document must contain this clause' },
  { value: 'MUST_NOT_HAVE', label: 'Must Not Have', description: 'Document must not contain this clause' },
  { value: 'THRESHOLD', label: 'Threshold', description: 'Numeric value must meet threshold' },
  { value: 'PATTERN', label: 'Pattern', description: 'Custom regex pattern matching' }
];

const SEVERITIES = [
  { value: 'INFO', label: 'Info', color: 'bg-blue-100 text-blue-700' },
  { value: 'WARNING', label: 'Warning', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'ERROR', label: 'Error', color: 'bg-orange-100 text-orange-700' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-100 text-red-700' }
];

const CLAUSE_CATEGORIES = [
  'indemnification',
  'termination',
  'liability_cap',
  'insurance',
  'confidentiality',
  'representations',
  'warranties',
  'closing_conditions',
  'earnest_money',
  'due_diligence',
  'environmental',
  'assignment',
  'governing_law',
  'dispute_resolution',
  'force_majeure',
  'other'
];

const THRESHOLD_OPERATORS = [
  { value: 'GT', label: 'Greater than (>)' },
  { value: 'GTE', label: 'Greater than or equal (>=)' },
  { value: 'LT', label: 'Less than (<)' },
  { value: 'LTE', label: 'Less than or equal (<=)' },
  { value: 'EQ', label: 'Equal to (=)' }
];

const DEFAULT_RULE = {
  ruleType: 'MUST_HAVE',
  clauseCategory: 'indemnification',
  ruleName: '',
  ruleDescription: '',
  searchPatterns: '',
  exampleText: '',
  antiPatterns: '',
  severity: 'WARNING',
  failureMessage: '',
  suggestedFix: '',
  thresholdField: '',
  thresholdOperator: 'GTE',
  thresholdValue: ''
};

/**
 * Form for creating/editing playbook rules
 */
export default function PlaybookRuleEditor({
  rule = null,
  onSave,
  onCancel,
  isLoading = false
}) {
  const [formData, setFormData] = useState(DEFAULT_RULE);
  const [errors, setErrors] = useState({});
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (rule) {
      setFormData({
        ...DEFAULT_RULE,
        ...rule,
        searchPatterns: Array.isArray(rule.searchPatterns)
          ? rule.searchPatterns.join('\n')
          : rule.searchPatterns || '',
        antiPatterns: Array.isArray(rule.antiPatterns)
          ? rule.antiPatterns.join('\n')
          : rule.antiPatterns || ''
      });
    }
  }, [rule]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.ruleName.trim()) {
      newErrors.ruleName = 'Rule name is required';
    }
    if (!formData.searchPatterns.trim() && formData.ruleType !== 'THRESHOLD') {
      newErrors.searchPatterns = 'At least one search pattern is required';
    }
    if (!formData.failureMessage.trim()) {
      newErrors.failureMessage = 'Failure message is required';
    }
    if (formData.ruleType === 'THRESHOLD') {
      if (!formData.thresholdField.trim()) {
        newErrors.thresholdField = 'Field name is required for threshold rules';
      }
      if (!formData.thresholdValue.trim()) {
        newErrors.thresholdValue = 'Threshold value is required';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Convert patterns to arrays
    const patterns = formData.searchPatterns
      .split('\n')
      .map(p => p.trim())
      .filter(Boolean);
    const antiPatterns = formData.antiPatterns
      .split('\n')
      .map(p => p.trim())
      .filter(Boolean);

    onSave({
      ...formData,
      searchPatterns: JSON.stringify(patterns),
      antiPatterns: antiPatterns.length > 0 ? JSON.stringify(antiPatterns) : null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {rule ? 'Edit Rule' : 'Add New Rule'}
        </h3>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-gray-400 hover:text-gray-600"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
          <p className="font-medium mb-2">Rule Types:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Must Have:</strong> Checks that the document contains specific language</li>
            <li><strong>Must Not Have:</strong> Checks that the document does NOT contain specific language</li>
            <li><strong>Threshold:</strong> Checks numeric values (e.g., liability cap ≥ $1M)</li>
            <li><strong>Pattern:</strong> Advanced regex pattern matching</li>
          </ul>
        </div>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rule Name *
          </label>
          <input
            type="text"
            value={formData.ruleName}
            onChange={(e) => handleChange('ruleName', e.target.value)}
            placeholder="e.g., Indemnification Required"
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${errors.ruleName ? 'border-red-300' : 'border-gray-300'}`}
          />
          {errors.ruleName && (
            <p className="mt-1 text-sm text-red-600">{errors.ruleName}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rule Type *
          </label>
          <select
            value={formData.ruleType}
            onChange={(e) => handleChange('ruleType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {RULE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={formData.ruleDescription}
          onChange={(e) => handleChange('ruleDescription', e.target.value)}
          rows={2}
          placeholder="Explain what this rule checks for..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Category and Severity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Clause Category
          </label>
          <select
            value={formData.clauseCategory}
            onChange={(e) => handleChange('clauseCategory', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {CLAUSE_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Severity
          </label>
          <select
            value={formData.severity}
            onChange={(e) => handleChange('severity', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {SEVERITIES.map(sev => (
              <option key={sev.value} value={sev.value}>{sev.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Threshold Fields (conditional) */}
      {formData.ruleType === 'THRESHOLD' && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Field Name *
            </label>
            <input
              type="text"
              value={formData.thresholdField}
              onChange={(e) => handleChange('thresholdField', e.target.value)}
              placeholder="e.g., liabilityCap"
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${errors.thresholdField ? 'border-red-300' : 'border-gray-300'}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Operator
            </label>
            <select
              value={formData.thresholdOperator}
              onChange={(e) => handleChange('thresholdOperator', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {THRESHOLD_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Value *
            </label>
            <input
              type="text"
              value={formData.thresholdValue}
              onChange={(e) => handleChange('thresholdValue', e.target.value)}
              placeholder="e.g., 1000000"
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${errors.thresholdValue ? 'border-red-300' : 'border-gray-300'}`}
            />
          </div>
        </div>
      )}

      {/* Search Patterns */}
      {formData.ruleType !== 'THRESHOLD' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Patterns * (one per line)
          </label>
          <textarea
            value={formData.searchPatterns}
            onChange={(e) => handleChange('searchPatterns', e.target.value)}
            rows={3}
            placeholder="indemnif&#10;hold harmless&#10;defend and indemnify"
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 font-mono text-sm ${errors.searchPatterns ? 'border-red-300' : 'border-gray-300'}`}
          />
          {errors.searchPatterns && (
            <p className="mt-1 text-sm text-red-600">{errors.searchPatterns}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Enter keywords or regex patterns. Case-insensitive matching.
          </p>
        </div>
      )}

      {/* Example Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Example Text
        </label>
        <textarea
          value={formData.exampleText}
          onChange={(e) => handleChange('exampleText', e.target.value)}
          rows={2}
          placeholder="Example of compliant language..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      {/* Failure Message */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Failure Message *
        </label>
        <input
          type="text"
          value={formData.failureMessage}
          onChange={(e) => handleChange('failureMessage', e.target.value)}
          placeholder="e.g., Missing required indemnification clause"
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${errors.failureMessage ? 'border-red-300' : 'border-gray-300'}`}
        />
        {errors.failureMessage && (
          <p className="mt-1 text-sm text-red-600">{errors.failureMessage}</p>
        )}
      </div>

      {/* Suggested Fix */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Suggested Fix
        </label>
        <input
          type="text"
          value={formData.suggestedFix}
          onChange={(e) => handleChange('suggestedFix', e.target.value)}
          placeholder="e.g., Add standard indemnification language from template"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : rule ? 'Update Rule' : 'Add Rule'}
        </button>
      </div>
    </form>
  );
}
