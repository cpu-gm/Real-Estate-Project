import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Link2,
  Users,
  Building2,
  Briefcase,
  Copy,
  Loader2
} from 'lucide-react';
import { bff } from '@/api/bffClient';

// Link type configurations
const LINK_TYPE_CONFIG = {
  CONTACT_DEAL: { label: 'Contact → Deal', icon: Users, color: 'bg-blue-100 text-blue-700' },
  LP_DEAL: { label: 'LP → Deal', icon: Briefcase, color: 'bg-purple-100 text-purple-700' },
  CONTACT_ENTITY: { label: 'Same Entity', icon: Copy, color: 'bg-amber-100 text-amber-700' },
  DEAL_PROPERTY: { label: 'Deal → Property', icon: Building2, color: 'bg-green-100 text-green-700' },
  DUPLICATE_ENTITY: { label: 'Duplicate', icon: Copy, color: 'bg-red-100 text-red-700' }
};

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-slate-100 text-slate-700' },
  CONFIRMED: { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700' }
};

// Confidence badge color
function getConfidenceColor(confidence) {
  if (confidence >= 0.8) return 'bg-green-100 text-green-700';
  if (confidence >= 0.6) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

// Link card component
function LinkCard({ link, isSelected, onClick }) {
  const typeConfig = LINK_TYPE_CONFIG[link.linkType] || LINK_TYPE_CONFIG.CONTACT_DEAL;
  const statusConfig = STATUS_CONFIG[link.status] || STATUS_CONFIG.PENDING;
  const TypeIcon = typeConfig.icon;

  return (
    <div
      className={`p-4 border rounded-lg cursor-pointer transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <TypeIcon className="w-4 h-4 text-slate-500" />
          <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
        </div>
        <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-slate-900 truncate">{link.sourceRecordTitle || link.sourceRecordKey}</span>
        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="font-medium text-slate-900 truncate">{link.targetRecordTitle || link.targetRecordKey}</span>
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span className="flex items-center gap-1">
          <Badge className={getConfidenceColor(link.matchConfidence)}>
            {Math.round(link.matchConfidence * 100)}%
          </Badge>
        </span>
        <span>{link.matchMethod?.replace(/_/g, ' ')}</span>
      </div>
    </div>
  );
}

// Link detail panel
function LinkDetailPanel({ link, onConfirm, onReject, isLoading }) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!link) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <Link2 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>Select a link to view details</p>
        </div>
      </div>
    );
  }

  const typeConfig = LINK_TYPE_CONFIG[link.linkType] || LINK_TYPE_CONFIG.CONTACT_DEAL;
  const TypeIcon = typeConfig.icon;

  const handleReject = () => {
    onReject(link.id, rejectionReason);
    setRejectionReason('');
    setShowRejectForm(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <TypeIcon className="w-5 h-5 text-slate-500" />
        <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
      </div>

      {/* Source Record */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-slate-500">Source Record</CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <p className="font-semibold text-slate-900">{link.sourceRecordTitle || link.sourceRecordKey}</p>
          <p className="text-sm text-slate-500">{link.sourceRecordType}</p>
        </CardContent>
      </Card>

      {/* Target Record */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-slate-500">Target Record</CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <p className="font-semibold text-slate-900">{link.targetRecordTitle || link.targetRecordKey}</p>
          <p className="text-sm text-slate-500">{link.targetRecordType}</p>
        </CardContent>
      </Card>

      {/* Match Details */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-slate-500">Match Details</CardTitle>
        </CardHeader>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Confidence</span>
            <Badge className={getConfidenceColor(link.matchConfidence)}>
              {Math.round(link.matchConfidence * 100)}%
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Method</span>
            <span className="text-sm font-medium">{link.matchMethod?.replace(/_/g, ' ')}</span>
          </div>
          {link.relationshipType && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Relationship</span>
              <span className="text-sm font-medium">{link.relationshipType?.replace(/_/g, ' ')}</span>
            </div>
          )}
          {link.matchEvidence && (
            <div className="pt-2 border-t">
              <span className="text-sm text-slate-500 block mb-1">Evidence</span>
              <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-32">
                {typeof link.matchEvidence === 'string'
                  ? link.matchEvidence
                  : JSON.stringify(link.matchEvidence, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejection reason input */}
      {showRejectForm && (
        <div className="space-y-2">
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
        </div>
      )}

      {/* Actions */}
      {link.status === 'PENDING' && (
        <div className="flex gap-2 pt-2">
          {showRejectForm ? (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowRejectForm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleReject}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Reject'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowRejectForm(true)}
                disabled={isLoading}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                className="flex-1"
                onClick={() => onConfirm(link.id)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirm
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Already resolved */}
      {link.status !== 'PENDING' && (
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {link.status === 'CONFIRMED' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            <span>
              {link.status === 'CONFIRMED' ? 'Confirmed' : 'Rejected'}
              {link.verifiedByName && ` by ${link.verifiedByName}`}
            </span>
          </div>
          {link.rejectionReason && (
            <p className="mt-2 text-sm text-slate-600 bg-slate-50 p-2 rounded">
              {link.rejectionReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingDataLinks() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get session ID from URL
  const sessionId = searchParams.get('sessionId') || localStorage.getItem('onboarding_session_id');

  // State
  const [links, setLinks] = useState([]);
  const [selectedLink, setSelectedLink] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch links from API
  const fetchLinks = useCallback(async (showRefreshIndicator = false) => {
    if (!sessionId) return;

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams({ sessionId });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (typeFilter !== 'all') params.append('linkType', typeFilter);

      const response = await bff.get(`/api/onboarding/links?${params.toString()}`);
      setLinks(response.data.links || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch links:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load data links');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sessionId, statusFilter, typeFilter]);

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      navigate('/onboarding');
      return;
    }
    fetchLinks();
  }, [sessionId, fetchLinks, navigate]);

  // Handle confirm link
  const handleConfirm = async (linkId) => {
    setActionLoading(linkId);
    try {
      await bff.post(`/api/onboarding/links/${linkId}/confirm`, {
        action: 'CONFIRM'
      });
      // Update local state
      setLinks(prev => prev.map(l =>
        l.id === linkId ? { ...l, status: 'CONFIRMED' } : l
      ));
      if (selectedLink?.id === linkId) {
        setSelectedLink(prev => ({ ...prev, status: 'CONFIRMED' }));
      }
    } catch (err) {
      console.error('Failed to confirm link:', err);
      setError('Failed to confirm link. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle reject link
  const handleReject = async (linkId, reason) => {
    setActionLoading(linkId);
    try {
      await bff.post(`/api/onboarding/links/${linkId}/confirm`, {
        action: 'REJECT',
        rejectionReason: reason
      });
      // Update local state
      setLinks(prev => prev.map(l =>
        l.id === linkId ? { ...l, status: 'REJECTED', rejectionReason: reason } : l
      ));
      if (selectedLink?.id === linkId) {
        setSelectedLink(prev => ({ ...prev, status: 'REJECTED', rejectionReason: reason }));
      }
    } catch (err) {
      console.error('Failed to reject link:', err);
      setError('Failed to reject link. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats
  const stats = {
    total: links.length,
    pending: links.filter(l => l.status === 'PENDING').length,
    confirmed: links.filter(l => l.status === 'CONFIRMED').length,
    rejected: links.filter(l => l.status === 'REJECTED').length
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-96 col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  // No session
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-slate-500 mb-4">
              No onboarding session found. Please start from the onboarding wizard.
            </p>
            <Button onClick={() => navigate('/onboarding/wizard')}>
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Discovered Relationships</h1>
              <p className="text-sm text-slate-500">
                Review and confirm data connections found by AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchLinks(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => navigate(`/onboarding/status?sessionId=${sessionId}`)}>
              Back to Status
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => fetchLinks(true)}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Links</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                </div>
                <Link2 className="w-8 h-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Confirmed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Rejected</p>
                  <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Link Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="CONTACT_DEAL">Contact → Deal</SelectItem>
              <SelectItem value="LP_DEAL">LP → Deal</SelectItem>
              <SelectItem value="CONTACT_ENTITY">Same Entity</SelectItem>
              <SelectItem value="DEAL_PROPERTY">Deal → Property</SelectItem>
              <SelectItem value="DUPLICATE_ENTITY">Duplicate</SelectItem>
            </SelectContent>
          </Select>

          {stats.pending > 0 && (
            <Badge className="bg-amber-100 text-amber-700">
              {stats.pending} pending review
            </Badge>
          )}
        </div>

        {/* Main Content */}
        {links.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Link2 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No Links Found</h3>
              <p className="text-slate-500 mb-4">
                {statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'No links match the current filters. Try adjusting your filters.'
                  : 'No data relationships have been discovered yet. Links will appear as your data is processed.'}
              </p>
              {(statusFilter !== 'all' || typeFilter !== 'all') && (
                <Button variant="outline" onClick={() => {
                  setStatusFilter('all');
                  setTypeFilter('all');
                }}>
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-6" style={{ minHeight: '500px' }}>
            {/* Links List */}
            <div className="col-span-2 space-y-3 overflow-auto max-h-[calc(100vh-400px)]">
              {links.map(link => (
                <LinkCard
                  key={link.id}
                  link={link}
                  isSelected={selectedLink?.id === link.id}
                  onClick={() => setSelectedLink(link)}
                />
              ))}
            </div>

            {/* Detail Panel */}
            <Card className="sticky top-6">
              <CardHeader className="border-b">
                <CardTitle className="text-lg">Link Details</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <LinkDetailPanel
                  link={selectedLink}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                  isLoading={actionLoading === selectedLink?.id}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
