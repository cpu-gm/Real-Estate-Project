import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  GripVertical,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { bff } from '@/api/bffClient';
import PlaybookRuleEditor from '@/components/legal/PlaybookRuleEditor';

const DOCUMENT_TYPES = [
  { value: 'LEASE', label: 'Lease Agreement' },
  { value: 'PSA', label: 'Purchase & Sale Agreement' },
  { value: 'LOI', label: 'Letter of Intent' },
  { value: 'OPERATING_AGREEMENT', label: 'Operating Agreement' },
  { value: 'CONTRACT', label: 'General Contract' },
  { value: 'AMENDMENT', label: 'Amendment' }
];

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'ACTIVE', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'ARCHIVED', label: 'Archived', color: 'bg-yellow-100 text-yellow-700' }
];

export default function PlaybookBuilder() {
  const { playbookId } = useParams();
  const navigate = useNavigate();
  const isNew = !playbookId || playbookId === 'new';

  const [playbook, setPlaybook] = useState({
    name: '',
    description: '',
    documentTypes: [],
    status: 'DRAFT'
  });
  const [rules, setRules] = useState([]);
  const [expandedRule, setExpandedRule] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (!isNew) {
      loadPlaybook();
    }
  }, [playbookId]);

  const loadPlaybook = async () => {
    try {
      setIsLoading(true);
      const data = await bff.legal.getPlaybook(playbookId);
      setPlaybook({
        name: data.name,
        description: data.description || '',
        documentTypes: typeof data.documentTypes === 'string'
          ? JSON.parse(data.documentTypes)
          : data.documentTypes || [],
        status: data.status
      });
      setRules(data.rules || []);
    } catch (err) {
      setError(err.message || 'Failed to load playbook');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePlaybook = async () => {
    if (!playbook.name.trim()) {
      setError('Playbook name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const payload = {
        ...playbook,
        documentTypes: JSON.stringify(playbook.documentTypes)
      };

      if (isNew) {
        const created = await bff.legal.createPlaybook(payload);
        setSuccessMessage('Playbook created successfully');
        navigate(`/PlaybookBuilder/${created.id}`, { replace: true });
      } else {
        await bff.legal.updatePlaybook(playbookId, payload);
        setSuccessMessage('Playbook saved successfully');
      }

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save playbook');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRule = async (ruleData) => {
    try {
      setIsSaving(true);
      const newRule = await bff.legal.addPlaybookRule(playbookId, ruleData);
      setRules(prev => [...prev, newRule]);
      setShowRuleEditor(false);
      setSuccessMessage('Rule added successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateRule = async (ruleData) => {
    try {
      setIsSaving(true);
      const updated = await bff.legal.updatePlaybookRule(playbookId, editingRule.id, ruleData);
      setRules(prev => prev.map(r => r.id === editingRule.id ? updated : r));
      setEditingRule(null);
      setShowRuleEditor(false);
      setSuccessMessage('Rule updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;

    try {
      await bff.legal.deletePlaybookRule(playbookId, ruleId);
      setRules(prev => prev.filter(r => r.id !== ruleId));
      setSuccessMessage('Rule deleted');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete rule');
    }
  };

  const handleDocumentTypeToggle = (docType) => {
    setPlaybook(prev => ({
      ...prev,
      documentTypes: prev.documentTypes.includes(docType)
        ? prev.documentTypes.filter(t => t !== docType)
        : [...prev.documentTypes, docType]
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/LegalMatters')}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <BookOpen className="w-8 h-8 text-purple-500" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {isNew ? 'New Playbook' : 'Edit Playbook'}
                  </h1>
                  <p className="text-sm text-gray-500">
                    Define rules for automated contract analysis
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleSavePlaybook}
              disabled={isSaving}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save Playbook</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="max-w-5xl mx-auto px-6 mt-4 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-700">
              Dismiss
            </button>
          </div>
        )}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-green-700">{successMessage}</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Playbook Settings */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900 mb-4">Playbook Settings</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={playbook.name}
                    onChange={(e) => setPlaybook(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Standard PSA Checklist"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={playbook.description}
                    onChange={(e) => setPlaybook(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    placeholder="Describe the purpose of this playbook..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={playbook.status}
                    onChange={(e) => setPlaybook(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Applicable Document Types
                  </label>
                  <div className="space-y-2">
                    {DOCUMENT_TYPES.map(type => (
                      <label key={type.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={playbook.documentTypes.includes(type.value)}
                          onChange={() => handleDocumentTypeToggle(type.value)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Rules */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  Rules ({rules.length})
                </h3>
                {!isNew && (
                  <button
                    onClick={() => {
                      setEditingRule(null);
                      setShowRuleEditor(true);
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Rule</span>
                  </button>
                )}
              </div>

              {isNew ? (
                <div className="p-6 text-center text-gray-500">
                  <p>Save the playbook first to add rules</p>
                </div>
              ) : showRuleEditor ? (
                <div className="p-6">
                  <PlaybookRuleEditor
                    rule={editingRule}
                    onSave={editingRule ? handleUpdateRule : handleAddRule}
                    onCancel={() => {
                      setShowRuleEditor(false);
                      setEditingRule(null);
                    }}
                    isLoading={isSaving}
                  />
                </div>
              ) : rules.length === 0 ? (
                <div className="p-6 text-center">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No rules yet</p>
                  <button
                    onClick={() => setShowRuleEditor(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  >
                    Add First Rule
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {rules.map((rule, index) => (
                    <RuleItem
                      key={rule.id}
                      rule={rule}
                      index={index}
                      isExpanded={expandedRule === rule.id}
                      onToggle={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                      onEdit={() => {
                        setEditingRule(rule);
                        setShowRuleEditor(true);
                      }}
                      onDelete={() => handleDeleteRule(rule.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleItem({ rule, index, isExpanded, onToggle, onEdit, onDelete }) {
  const severityColors = {
    INFO: 'bg-blue-100 text-blue-700',
    WARNING: 'bg-yellow-100 text-yellow-700',
    ERROR: 'bg-orange-100 text-orange-700',
    CRITICAL: 'bg-red-100 text-red-700'
  };

  const ruleTypeLabels = {
    MUST_HAVE: 'Must Have',
    MUST_NOT_HAVE: 'Must Not Have',
    THRESHOLD: 'Threshold',
    PATTERN: 'Pattern'
  };

  return (
    <div className="hover:bg-gray-50">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center space-x-4">
          <GripVertical className="w-4 h-4 text-gray-400" />
          <span className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs font-medium text-gray-600">
            {index + 1}
          </span>
          <div>
            <p className="font-medium text-gray-900">{rule.ruleName}</p>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-xs text-gray-500">
                {ruleTypeLabels[rule.ruleType] || rule.ruleType}
              </span>
              <span className="text-xs text-gray-400">·</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${severityColors[rule.severity] || severityColors.WARNING}`}>
                {rule.severity}
              </span>
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-4 ml-14 space-y-3">
          {rule.ruleDescription && (
            <p className="text-sm text-gray-600">{rule.ruleDescription}</p>
          )}
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-gray-500">Category:</span>
            <span className="text-gray-900">{rule.clauseCategory?.replace(/_/g, ' ')}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">Failure Message:</span>
            <p className="text-gray-700 mt-0.5">{rule.failureMessage}</p>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-700 bg-red-50 rounded hover:bg-red-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
