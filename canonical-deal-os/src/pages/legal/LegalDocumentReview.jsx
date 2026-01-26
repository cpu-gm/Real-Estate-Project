import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Brain,
  BookOpen,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { bff } from '@/api/bffClient';
import AnalysisSummaryCard from '@/components/legal/AnalysisSummaryCard';
import PlaybookViolationList from '@/components/legal/PlaybookViolationList';
import RiskScoreBadge from '@/components/legal/RiskScoreBadge';

const STATUS_CONFIG = {
  UPLOADED: { label: 'Uploaded', color: 'text-gray-600', bg: 'bg-gray-100' },
  ANALYZING: { label: 'Analyzing...', color: 'text-blue-600', bg: 'bg-blue-100' },
  ANALYZED: { label: 'Analyzed', color: 'text-green-600', bg: 'bg-green-100' },
  FAILED: { label: 'Analysis Failed', color: 'text-red-600', bg: 'bg-red-100' }
};

export default function LegalDocumentReview() {
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [playbooks, setPlaybooks] = useState([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState(null);
  const [playbookResult, setPlaybookResult] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTestingPlaybook, setIsTestingPlaybook] = useState(false);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('analysis'); // analysis, playbook

  // Load document and analysis
  useEffect(() => {
    loadDocument();
    loadPlaybooks();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      setIsLoading(true);
      const doc = await bff.legal.getDocument(documentId);
      setDocument(doc);

      // Load analysis if available
      if (doc.status === 'ANALYZED') {
        const analysisData = await bff.legal.getDocumentAnalysis(documentId);
        setAnalysis(analysisData);
      }
    } catch (err) {
      setError(err.message || 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlaybooks = async () => {
    try {
      const response = await bff.legal.listPlaybooks({ status: 'ACTIVE' });
      setPlaybooks(response.playbooks || []);
    } catch (err) {
      console.error('Failed to load playbooks:', err);
    }
  };

  const handleAnalyze = async () => {
    try {
      setIsAnalyzing(true);
      setError(null);

      const result = await bff.legal.analyzeDocument(documentId);
      setAnalysis(result);
      setDocument(prev => ({ ...prev, status: 'ANALYZED' }));
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTestPlaybook = async (playbookId) => {
    try {
      setIsTestingPlaybook(true);
      setSelectedPlaybook(playbookId);

      const result = await bff.legal.analyzeWithPlaybook(documentId, playbookId);
      setPlaybookResult(result);
      setActiveTab('playbook');
    } catch (err) {
      setError(err.message || 'Playbook test failed');
    } finally {
      setIsTestingPlaybook(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[document?.status] || STATUS_CONFIG.UPLOADED;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <FileText className="w-8 h-8 text-blue-500" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {document?.filename}
                  </h1>
                  <div className="flex items-center space-x-3 text-sm text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                    <span>Uploaded {formatDate(document?.uploadedAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Analyze Button */}
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || document?.status === 'ANALYZING'}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
                <span>{analysis ? 'Re-Analyze' : 'Analyze with AI'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-700 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Document Info & Playbooks */}
          <div className="space-y-6">
            {/* Document Details */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900 mb-4">Document Details</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Type</dt>
                  <dd className="text-sm text-gray-900">{document?.documentType}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Size</dt>
                  <dd className="text-sm text-gray-900">
                    {document?.sizeBytes ? `${(document.sizeBytes / 1024).toFixed(1)} KB` : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Pages</dt>
                  <dd className="text-sm text-gray-900">{document?.pageCount || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Uploaded By</dt>
                  <dd className="text-sm text-gray-900">{document?.uploadedByName || '-'}</dd>
                </div>
              </dl>
            </div>

            {/* Playbook Selection */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-purple-500" />
                <span>Test Against Playbook</span>
              </h3>
              {playbooks.length === 0 ? (
                <p className="text-sm text-gray-500">No playbooks available</p>
              ) : (
                <div className="space-y-2">
                  {playbooks.map(pb => (
                    <button
                      key={pb.id}
                      onClick={() => handleTestPlaybook(pb.id)}
                      disabled={isTestingPlaybook || !analysis}
                      className={`w-full text-left p-3 rounded-md border transition-colors ${
                        selectedPlaybook === pb.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <p className="font-medium text-gray-900">{pb.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {pb.description || `${pb._count?.rules || 0} rules`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {!analysis && playbooks.length > 0 && (
                <p className="text-xs text-gray-400 mt-3">
                  Analyze document first to test against playbooks
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Analysis Results */}
          <div className="col-span-2">
            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('analysis')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'analysis'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    AI Analysis
                  </button>
                  <button
                    onClick={() => setActiveTab('playbook')}
                    disabled={!playbookResult}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'playbook'
                        ? 'border-purple-500 text-purple-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    Playbook Results
                    {playbookResult && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                        {playbookResult.violations?.length || 0}
                      </span>
                    )}
                  </button>
                </nav>
              </div>

              <div className="p-6">
                {activeTab === 'analysis' && (
                  <>
                    {document?.status === 'ANALYZING' || isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                        <p className="text-gray-600">Analyzing document with AI...</p>
                        <p className="text-sm text-gray-400 mt-1">This may take a moment</p>
                      </div>
                    ) : analysis ? (
                      <AnalysisSummaryCard analysis={analysis} />
                    ) : (
                      <div className="text-center py-12">
                        <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          No Analysis Yet
                        </h3>
                        <p className="text-gray-500 mb-4">
                          Click "Analyze with AI" to extract key terms, identify risks, and get a summary
                        </p>
                        <button
                          onClick={handleAnalyze}
                          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                        >
                          Start Analysis
                        </button>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'playbook' && playbookResult && (
                  <PlaybookViolationList
                    violations={playbookResult.violations || []}
                    playbookScore={playbookResult.playbookScore}
                    playbookName={playbooks.find(p => p.id === selectedPlaybook)?.name}
                  />
                )}
              </div>
            </div>

            {/* Quick Risk Summary (if analyzed) */}
            {analysis && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Quick Summary</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <RiskScoreBadge score={analysis.riskScore} size="lg" />
                    <div>
                      <p className="text-sm text-gray-600">
                        Confidence: {Math.round((analysis.overallConfidence || 0.8) * 100)}%
                      </p>
                      <p className="text-xs text-gray-400">
                        Analyzed {formatDate(analysis.analyzedAt)}
                      </p>
                    </div>
                  </div>
                  {analysis.missingClauses && JSON.parse(analysis.missingClauses).length > 0 && (
                    <div className="flex items-center space-x-2 text-yellow-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm">
                        {JSON.parse(analysis.missingClauses).length} missing clauses
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
