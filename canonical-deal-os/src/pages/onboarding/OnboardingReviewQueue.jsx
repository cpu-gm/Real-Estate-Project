import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Grid3X3,
  List,
  Columns,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { SplitReviewPanel, RecordReviewCard, ConflictResolutionPanel, ConflictList } from '@/components/onboarding';
import { bff } from '@/api/bffClient';
import { X } from 'lucide-react';

export default function OnboardingReviewQueue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get session ID and filters from URL
  const sessionId = searchParams.get('sessionId') || localStorage.getItem('onboarding_session_id');
  const initialCategory = searchParams.get('category');
  const initialStage = searchParams.get('stage');

  // State
  const [viewMode, setViewMode] = useState('split'); // 'split', 'list', 'cards'
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState(initialCategory || initialStage || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRecords, setExpandedRecords] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // Track which record action is loading

  // Conflicts state (Phase 2)
  const [conflicts, setConflicts] = useState([]);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [showConflictPanel, setShowConflictPanel] = useState(false);

  // Fetch claims/records from API
  const fetchRecords = useCallback(async () => {
    if (!sessionId) return;

    try {
      const params = new URLSearchParams({ sessionId });
      if (initialCategory) params.append('category', initialCategory);
      if (initialStage) params.append('stage', initialStage);

      const response = await bff.get(`/api/onboarding/claims?${params.toString()}`);
      const data = response.data;

      // Transform claims to record format expected by components
      const transformedRecords = (data.records || data.claims || []).map(claim => ({
        id: claim.id,
        title: claim.title || claim.value || claim.fieldPath || 'Untitled Record',
        category: claim.category || 'Unknown',
        status: claim.status?.toLowerCase() || 'pending',
        sourceId: claim.sourceId || claim.intakeSourceId,
        fields: claim.fields || [{
          id: claim.id,
          label: claim.fieldPath || 'Value',
          value: claim.value,
          displayValue: claim.displayValue || claim.value,
          confidence: claim.confidence || 0.5,
          provenance: {
            documentName: claim.documentName,
            pageNumber: claim.pageNumber,
            cellReference: claim.cellReference,
            textSnippet: claim.textSnippet
          }
        }]
      }));

      setRecords(transformedRecords);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch records:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [sessionId, initialCategory, initialStage]);

  // Fetch conflicts from API
  const fetchConflicts = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await bff.get(`/api/onboarding/conflicts?sessionId=${sessionId}`);
      const data = response.data;
      setConflicts(data.conflicts || []);

      // Auto-select first unresolved conflict
      const firstUnresolved = (data.conflicts || []).find(c => c.status === 'UNRESOLVED');
      if (firstUnresolved && !selectedConflict) {
        setSelectedConflict(firstUnresolved);
      }
    } catch (err) {
      console.error('Failed to fetch conflicts:', err);
      // Don't set error - conflicts are optional
    }
  }, [sessionId, selectedConflict]);

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      navigate('/onboarding');
      return;
    }
    fetchRecords();
    fetchConflicts();
  }, [sessionId, fetchRecords, fetchConflicts, navigate]);

  // Filter records
  const filteredRecords = records.filter(record => {
    if (filter === 'pending' && record.status !== 'pending' && record.status !== 'unverified') return false;
    if (filter === 'low_confidence') {
      const avgConfidence = record.fields.reduce((sum, f) => sum + (f.confidence || 0), 0) / record.fields.length;
      if (avgConfidence >= 0.7) return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return record.title.toLowerCase().includes(query) ||
             record.category.toLowerCase().includes(query);
    }
    return true;
  });

  const selectedRecord = filteredRecords[selectedRecordIndex];
  const pendingCount = records.filter(r => r.status === 'pending' || r.status === 'unverified').length;
  const lowConfidenceCount = records.filter(r => {
    const avg = r.fields.reduce((sum, f) => sum + (f.confidence || 0), 0) / r.fields.length;
    return avg < 0.7;
  }).length;

  // Action handlers
  const handleApprove = async (recordId) => {
    setActionLoading(recordId);
    try {
      await bff.post(`/api/onboarding/claims/${recordId}/approve`);

      // Update local state optimistically
      setRecords(records.map(r =>
        r.id === recordId ? { ...r, status: 'approved' } : r
      ));

      // Move to next pending record
      const nextPendingIndex = filteredRecords.findIndex((r, i) =>
        i > selectedRecordIndex && (r.status === 'pending' || r.status === 'unverified')
      );
      if (nextPendingIndex !== -1) {
        setSelectedRecordIndex(nextPendingIndex);
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setError('Failed to approve record. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (recordId) => {
    setActionLoading(recordId);
    try {
      await bff.post(`/api/onboarding/claims/${recordId}/reject`);

      setRecords(records.map(r =>
        r.id === recordId ? { ...r, status: 'rejected' } : r
      ));
    } catch (err) {
      console.error('Failed to reject:', err);
      setError('Failed to reject record. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFieldEdit = async (recordId, fieldId, newValue) => {
    // Update local state immediately
    setRecords(records.map(r => {
      if (r.id !== recordId) return r;
      return {
        ...r,
        fields: r.fields.map(f =>
          f.id === fieldId ? { ...f, value: newValue, displayValue: newValue } : f
        )
      };
    }));

    // Optionally save to server (could be debounced)
    try {
      await bff.patch(`/api/onboarding/claims/${recordId}`, {
        fieldId,
        value: newValue
      });
    } catch (err) {
      console.error('Failed to save field edit:', err);
      // Could show a toast here, but don't revert since user can still work
    }
  };

  const toggleRecordExpand = (recordId) => {
    const newExpanded = new Set(expandedRecords);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
    }
    setExpandedRecords(newExpanded);
  };

  // Conflict resolution handler
  const handleResolveConflict = async (conflictId, resolutionMethod, resolvedValue) => {
    try {
      await bff.post(`/api/onboarding/conflicts/${conflictId}/resolve`, {
        resolutionMethod,
        resolvedValue
      });

      // Update local state
      setConflicts(prev => prev.map(c =>
        c.id === conflictId ? { ...c, status: 'USER_RESOLVED', resolvedValue } : c
      ));

      // Move to next unresolved conflict
      const nextUnresolved = conflicts.find(c =>
        c.status === 'UNRESOLVED' && c.id !== conflictId
      );
      setSelectedConflict(nextUnresolved || null);

      // Refetch records as conflict resolution may have updated them
      fetchRecords();
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
      setError('Failed to resolve conflict. Please try again.');
    }
  };

  const handleSkipConflict = () => {
    const nextUnresolved = conflicts.find(c =>
      c.status === 'UNRESOLVED' && c.id !== selectedConflict?.id
    );
    setSelectedConflict(nextUnresolved || null);
  };

  const handleViewConflictSource = (claim) => {
    // TODO: Could scroll to or highlight the relevant record/field
    console.log('View source for claim:', claim);
  };

  const handleDoneReviewing = () => {
    navigate(`/onboarding/status?sessionId=${sessionId}`);
  };

  // Build source object for the selected record
  const getSourceForRecord = (record) => {
    if (!record) return null;
    const firstField = record.fields[0];
    return {
      type: 'pdf',
      fileName: firstField?.provenance?.documentName || 'Source Document',
      totalPages: 1,
      content: firstField?.provenance?.textSnippet || ''
    };
  };

  // Loading state
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-slate-50">
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-6 w-32 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="grid grid-cols-2 gap-6 h-full">
            <Skeleton className="h-full" />
            <Skeleton className="h-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Review Queue</h1>
            <p className="text-sm text-slate-500">
              {pendingCount} pending · {lowConfidenceCount} need attention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh */}
          <Button variant="ghost" size="icon" onClick={fetchRecords}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          {/* Filter */}
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Records</SelectItem>
              <SelectItem value="pending">Pending Only</SelectItem>
              <SelectItem value="low_confidence">Low Confidence</SelectItem>
            </SelectContent>
          </Select>

          {/* View mode toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg p-1">
            <Button
              variant={viewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('split')}
            >
              <Columns className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('cards')}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
          </div>

          {/* Conflicts toggle */}
          {conflicts.filter(c => c.status === 'UNRESOLVED').length > 0 && (
            <Button
              variant={showConflictPanel ? 'secondary' : 'outline'}
              onClick={() => setShowConflictPanel(!showConflictPanel)}
            >
              <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
              {conflicts.filter(c => c.status === 'UNRESOLVED').length} Conflicts
            </Button>
          )}

          <Button onClick={handleDoneReviewing}>
            Done Reviewing
            <CheckCircle2 className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty State */}
      {filteredRecords.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">All caught up!</h2>
            <p className="text-slate-500 mb-4">
              {records.length === 0
                ? 'No records to review yet. Data is still being processed.'
                : 'All records matching your filter have been reviewed.'}
            </p>
            <Button onClick={handleDoneReviewing}>
              Back to Status
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {filteredRecords.length > 0 && (
        <div className="flex-1 overflow-hidden flex">
          {/* Main content area */}
          <div className={`flex-1 overflow-hidden ${showConflictPanel ? 'border-r border-slate-200' : ''}`}>
            {viewMode === 'split' && selectedRecord ? (
              <SplitReviewPanel
                record={selectedRecord}
                source={getSourceForRecord(selectedRecord)}
                fields={selectedRecord.fields}
                onFieldEdit={(fieldId, newValue) => handleFieldEdit(selectedRecord.id, fieldId, newValue)}
                onFieldSave={(fieldId, value) => handleFieldEdit(selectedRecord.id, fieldId, value)}
                onApprove={() => handleApprove(selectedRecord.id)}
                onReject={() => handleReject(selectedRecord.id)}
                onSkip={() => setSelectedRecordIndex(Math.min(selectedRecordIndex + 1, filteredRecords.length - 1))}
                currentIndex={selectedRecordIndex}
                totalRecords={filteredRecords.length}
                onNavigate={setSelectedRecordIndex}
                isLoading={actionLoading === selectedRecord.id}
                className="h-full"
              />
            ) : viewMode === 'list' ? (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-4xl mx-auto space-y-3">
                {filteredRecords.map((record, index) => (
                  <RecordReviewCard
                    key={record.id}
                    record={record}
                    fields={record.fields}
                    status={record.status}
                    isExpanded={expandedRecords.has(record.id)}
                    onToggleExpand={() => toggleRecordExpand(record.id)}
                    onApprove={() => handleApprove(record.id)}
                    onReject={() => handleReject(record.id)}
                    onFlag={() => {}}
                    onFieldEdit={(fieldId, value) => handleFieldEdit(record.id, fieldId, value)}
                    onViewSource={() => {
                      setSelectedRecordIndex(index);
                      setViewMode('split');
                    }}
                    isLoading={actionLoading === record.id}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
                {filteredRecords.map((record, index) => (
                  <RecordReviewCard
                    key={record.id}
                    record={record}
                    fields={record.fields}
                    status={record.status}
                    isExpanded={expandedRecords.has(record.id)}
                    onToggleExpand={() => toggleRecordExpand(record.id)}
                    onApprove={() => handleApprove(record.id)}
                    onReject={() => handleReject(record.id)}
                    onFlag={() => {}}
                    onFieldEdit={(fieldId, value) => handleFieldEdit(record.id, fieldId, value)}
                    onViewSource={() => {
                      setSelectedRecordIndex(index);
                      setViewMode('split');
                    }}
                    isLoading={actionLoading === record.id}
                  />
                ))}
              </div>
            </div>
          )}
          </div>

          {/* Conflict Resolution Panel - collapsible sidebar */}
          {showConflictPanel && conflicts.some(c => c.status === 'UNRESOLVED') && (
            <div className="w-96 flex flex-col bg-white">
              <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="font-medium text-slate-900">
                  Conflicts ({conflicts.filter(c => c.status === 'UNRESOLVED').length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowConflictPanel(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-auto">
                {/* Conflict list */}
                <div className="p-3 border-b">
                  <ConflictList
                    conflicts={conflicts}
                    selectedConflictId={selectedConflict?.id}
                    onSelectConflict={setSelectedConflict}
                  />
                </div>

                {/* Selected conflict resolution */}
                {selectedConflict && (
                  <div className="p-3">
                    <ConflictResolutionPanel
                      conflict={selectedConflict}
                      onResolve={handleResolveConflict}
                      onSkip={handleSkipConflict}
                      onViewSource={handleViewConflictSource}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer stats */}
      {filteredRecords.length > 0 && (
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-sm">
          <div className="flex items-center gap-6 text-slate-500">
            <span>
              <strong className="text-slate-900">{filteredRecords.length}</strong> records
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              {records.filter(r => r.status === 'approved' || r.status === 'verified').length} approved
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {lowConfidenceCount} need attention
            </span>
          </div>
          <div className="text-slate-500">
            Viewing {selectedRecordIndex + 1} of {filteredRecords.length}
          </div>
        </div>
      )}
    </div>
  );
}
