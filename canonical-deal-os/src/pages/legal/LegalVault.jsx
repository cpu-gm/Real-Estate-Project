import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Archive,
  FileText,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  History,
  BarChart3,
  Trash2,
  Sparkles
} from 'lucide-react';
import { bff } from '@/api/bffClient';
import VaultQueryInput from '@/components/legal/VaultQueryInput';
import VaultResultsList, { QueryHistoryItem } from '@/components/legal/VaultResultsList';

const VAULT_TYPES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'DUE_DILIGENCE', label: 'Due Diligence' },
  { value: 'LEASE_PORTFOLIO', label: 'Lease Portfolio' }
];

const REPORT_TYPES = [
  { value: 'RISK_SUMMARY', label: 'Risk Summary', description: 'Aggregate risk scores and flags' },
  { value: 'TERM_COMPARISON', label: 'Term Comparison', description: 'Compare key terms across documents' },
  { value: 'CLAUSE_INVENTORY', label: 'Clause Inventory', description: 'List all identified clauses' }
];

export default function LegalVault() {
  const { vaultId } = useParams();
  const navigate = useNavigate();
  const isNew = !vaultId || vaultId === 'new';

  // Vault state
  const [vault, setVault] = useState({
    name: '',
    description: '',
    vaultType: 'GENERAL'
  });
  const [vaultDocuments, setVaultDocuments] = useState([]);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [queryHistory, setQueryHistory] = useState([]);

  // Query state
  const [currentQuery, setCurrentQuery] = useState(null);
  const [queryResults, setQueryResults] = useState(null);

  // UI state
  const [activeTab, setActiveTab] = useState('documents'); // documents, query, history, reports
  const [showAddDocuments, setShowAddDocuments] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState([]);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isNew) {
      loadVault();
    }
  }, [vaultId]);

  const loadVault = async () => {
    try {
      setIsLoading(true);
      const [vaultData, docsData, queriesData] = await Promise.all([
        bff.legal.getVault(vaultId),
        bff.legal.listVaultDocuments(vaultId),
        bff.legal.getVaultQueries(vaultId)
      ]);

      setVault({
        name: vaultData.name,
        description: vaultData.description || '',
        vaultType: vaultData.vaultType
      });
      setVaultDocuments(docsData.documents || []);
      setQueryHistory(queriesData.queries || []);
    } catch (err) {
      setError(err.message || 'Failed to load vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveVault = async () => {
    if (!vault.name.trim()) {
      setError('Vault name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      if (isNew) {
        const created = await bff.legal.createVault(vault);
        navigate(`/LegalVault/${created.id}`, { replace: true });
      } else {
        await bff.legal.updateVault(vaultId, vault);
      }
    } catch (err) {
      setError(err.message || 'Failed to save vault');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuery = async (query) => {
    try {
      setIsQuerying(true);
      setCurrentQuery(query);
      setError(null);

      const result = await bff.legal.queryVault(vaultId, query);
      setQueryResults(result);
      setActiveTab('query');

      // Refresh query history
      const queriesData = await bff.legal.getVaultQueries(vaultId);
      setQueryHistory(queriesData.queries || []);
    } catch (err) {
      setError(err.message || 'Query failed');
    } finally {
      setIsQuerying(false);
    }
  };

  const handleAddDocuments = async () => {
    if (selectedDocs.length === 0) return;

    try {
      setIsSaving(true);
      await bff.legal.addVaultDocuments(vaultId, selectedDocs);
      setSelectedDocs([]);
      setShowAddDocuments(false);

      // Reload documents
      const docsData = await bff.legal.listVaultDocuments(vaultId);
      setVaultDocuments(docsData.documents || []);
    } catch (err) {
      setError(err.message || 'Failed to add documents');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveDocument = async (documentId) => {
    if (!window.confirm('Remove this document from the vault?')) return;

    try {
      await bff.legal.removeVaultDocument(vaultId, documentId);
      setVaultDocuments(prev => prev.filter(d => d.documentId !== documentId));
    } catch (err) {
      setError(err.message || 'Failed to remove document');
    }
  };

  const handleGenerateReport = async (reportType) => {
    try {
      setIsQuerying(true);
      const result = await bff.legal.generateVaultReport(vaultId, reportType);
      setQueryResults({
        ...result,
        isReport: true,
        reportType
      });
      setActiveTab('query');
    } catch (err) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setIsQuerying(false);
    }
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
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <Archive className="w-8 h-8 text-indigo-500" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {isNew ? 'New Vault' : vault.name || 'Document Vault'}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {isNew
                      ? 'Create a collection for bulk document analysis'
                      : `${vaultDocuments.length} document${vaultDocuments.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
            </div>

            {isNew ? (
              <button
                onClick={handleSaveVault}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Create Vault'}
              </button>
            ) : (
              <button
                onClick={() => setShowAddDocuments(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" />
                <span>Add Documents</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-6xl mx-auto px-6 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-700">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* New Vault Form */}
      {isNew && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-xl">
            <h3 className="font-medium text-gray-900 mb-4">Vault Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={vault.name}
                  onChange={(e) => setVault(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Oak Tower DD Documents"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={vault.vaultType}
                  onChange={(e) => setVault(prev => ({ ...prev, vaultType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {VAULT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={vault.description}
                  onChange={(e) => setVault(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!isNew && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Query Input */}
          <div className="mb-6">
            <VaultQueryInput
              onQuery={handleQuery}
              isLoading={isQuerying}
              recentQueries={queryHistory.slice(0, 5)}
            />
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'documents'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FileText className="w-4 h-4 inline mr-2" />
                  Documents ({vaultDocuments.length})
                </button>
                <button
                  onClick={() => setActiveTab('query')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'query'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Sparkles className="w-4 h-4 inline mr-2" />
                  Query Results
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'history'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <History className="w-4 h-4 inline mr-2" />
                  History
                </button>
                <button
                  onClick={() => setActiveTab('reports')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'reports'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  Reports
                </button>
              </nav>
            </div>

            <div className="p-6">
              {/* Documents Tab */}
              {activeTab === 'documents' && (
                <div>
                  {vaultDocuments.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-4">No documents in this vault</p>
                      <button
                        onClick={() => setShowAddDocuments(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                      >
                        Add Documents
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {vaultDocuments.map((doc) => (
                        <div key={doc.id} className="py-3 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <FileText className="w-5 h-5 text-blue-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {doc.document?.filename || doc.documentId}
                              </p>
                              <p className="text-xs text-gray-500">
                                {doc.document?.documentType || 'Unknown type'}
                                {doc.embeddingStatus === 'READY' && (
                                  <span className="ml-2 text-green-600">✓ Indexed</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveDocument(doc.documentId)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Query Results Tab */}
              {activeTab === 'query' && (
                <VaultResultsList
                  results={queryResults?.results}
                  summary={queryResults?.summary}
                  documentHits={queryResults?.documentHits}
                  isLoading={isQuerying}
                />
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div>
                  {queryHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No query history yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 -mx-6">
                      {queryHistory.map((query) => (
                        <QueryHistoryItem
                          key={query.id}
                          query={query}
                          onClick={() => handleQuery(query.query)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reports Tab */}
              {activeTab === 'reports' && (
                <div className="grid grid-cols-3 gap-4">
                  {REPORT_TYPES.map((report) => (
                    <button
                      key={report.value}
                      onClick={() => handleGenerateReport(report.value)}
                      disabled={isQuerying || vaultDocuments.length === 0}
                      className="p-4 text-left border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <h4 className="font-medium text-gray-900">{report.label}</h4>
                      <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Documents Modal */}
      {showAddDocuments && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowAddDocuments(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Documents to Vault</h3>
              <p className="text-sm text-gray-500 mb-4">
                Select analyzed documents to add to this vault for bulk querying.
              </p>
              {/* Document selection would go here - simplified for now */}
              <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                <p>Document selection UI would be integrated here</p>
                <p className="text-xs mt-1">Connect to matter documents listing</p>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddDocuments(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDocuments}
                  disabled={selectedDocs.length === 0}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
