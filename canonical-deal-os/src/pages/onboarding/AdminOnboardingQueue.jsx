import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  ChevronRight,
  RefreshCw,
  Eye,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { bff } from '@/api/bffClient';

const STATUS_CONFIG = {
  SETUP: { label: 'Setup', color: 'bg-slate-100 text-slate-700' },
  UPLOADING: { label: 'Uploading', color: 'bg-slate-100 text-slate-700' },
  PROCESSING: { label: 'Processing', color: 'bg-blue-100 text-blue-700' },
  REVIEW: { label: 'Customer Review', color: 'bg-amber-100 text-amber-700' },
  TEAM_REVIEW: { label: 'Team Review', color: 'bg-purple-100 text-purple-700' },
  READY: { label: 'Ready', color: 'bg-green-100 text-green-700' },
  LIVE: { label: 'Live', color: 'bg-slate-100 text-slate-700' }
};

function getSLAStatus(deadline) {
  if (!deadline) {
    return { status: 'none', label: 'No SLA', color: 'text-slate-400', icon: Clock };
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);

  if (hoursRemaining < 0) {
    return { status: 'overdue', label: 'Overdue', color: 'text-red-600', icon: AlertTriangle };
  } else if (hoursRemaining < 4) {
    return { status: 'urgent', label: `${Math.ceil(hoursRemaining)}h left`, color: 'text-amber-600', icon: Clock };
  } else {
    return { status: 'ok', label: `${Math.ceil(hoursRemaining)}h left`, color: 'text-green-600', icon: CheckCircle2 };
  }
}

export default function AdminOnboardingQueue() {
  const navigate = useNavigate();

  // State
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  // Fetch queue from API
  const fetchQueue = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (assigneeFilter === 'unassigned') params.append('assignedTo', 'null');
      if (assigneeFilter === 'mine') params.append('assignedTo', 'me');

      const response = await bff.get(`/api/admin/onboarding/queue?${params.toString()}`);
      setSessions(response.data.sessions || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch queue:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load onboarding queue');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, assigneeFilter]);

  // Initial load and polling
  useEffect(() => {
    fetchQueue();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      fetchQueue(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Filter queue by search
  const filteredQueue = sessions.filter(session => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const orgName = session.organization?.name || session.organizationName || '';
      return orgName.toLowerCase().includes(query);
    }
    return true;
  });

  // Stats
  const stats = {
    total: sessions.length,
    processing: sessions.filter(s => s.status === 'PROCESSING').length,
    review: sessions.filter(s => s.status === 'TEAM_REVIEW').length,
    overdue: sessions.filter(s => getSLAStatus(s.slaDeadline).status === 'overdue').length
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
          <Skeleton className="h-16 mb-6" />
          <Skeleton className="h-96" />
        </div>
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
              <h1 className="text-2xl font-bold text-slate-900">Onboarding Queue</h1>
              <p className="text-sm text-slate-500">
                Manage organization data imports
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => fetchQueue(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => fetchQueue(true)}>
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
                  <p className="text-sm text-slate-500">Total Active</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                </div>
                <Building2 className="w-8 h-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Processing</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
                </div>
                <RefreshCw className="w-8 h-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Needs Review</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.review}</p>
                </div>
                <Eye className="w-8 h-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>
          <Card className={stats.overdue > 0 ? 'border-red-200 bg-red-50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">SLA Overdue</p>
                  <p className={`text-2xl font-bold ${stats.overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                    {stats.overdue}
                  </p>
                </div>
                <AlertTriangle className={`w-8 h-8 ${stats.overdue > 0 ? 'text-red-300' : 'text-slate-200'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search organizations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="REVIEW">Customer Review</SelectItem>
                  <SelectItem value="TEAM_REVIEW">Team Review</SelectItem>
                  <SelectItem value="READY">Ready</SelectItem>
                </SelectContent>
              </Select>

              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  <SelectItem value="mine">Assigned to Me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1" />

              <Badge variant="outline">
                {filteredQueue.length} results
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Queue Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Import Queue</CardTitle>
            <CardDescription>
              Click on a row to view details and take action
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQueue.map((session) => {
                  const statusConfig = STATUS_CONFIG[session.status] || STATUS_CONFIG.PROCESSING;
                  const slaStatus = getSLAStatus(session.slaDeadline);
                  const SLAIcon = slaStatus.icon;
                  const totalRecords = session.totalRecords || 0;
                  const processedRecords = session.processedRecords || 0;
                  const progressPercent = totalRecords > 0
                    ? Math.round((processedRecords / totalRecords) * 100)
                    : 0;
                  const orgName = session.organization?.name || session.organizationName || 'Unknown Org';
                  const orgType = session.organization?.type || session.organizationType || 'GP';
                  const pendingItems = (totalRecords - (session.verifiedRecords || 0)) || 0;

                  return (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/admin/onboarding/${session.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">
                              {orgName}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2">
                              <span>{orgType}</span>
                              {session.tier === 'WHITE_GLOVE' && (
                                <Badge className="text-xs bg-purple-100 text-purple-700">
                                  White Glove
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.color}>
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-900 font-medium">{progressPercent}%</span>
                            <span className="text-slate-500">
                              ({processedRecords}/{totalRecords})
                            </span>
                          </div>
                          {pendingItems > 0 && (
                            <span className="text-xs text-amber-600">
                              {pendingItems} pending review
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1.5 ${slaStatus.color}`}>
                          <SLAIcon className="w-4 h-4" />
                          <span className="text-sm font-medium">{slaStatus.label}</span>
                        </div>
                        {session.createdAt && (
                          <div className="text-xs text-slate-400">
                            Submitted {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {session.assignedTo || session.assignedToName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                              {(session.assignedToName || 'U').split(' ').map(n => n[0]).join('')}
                            </div>
                            <span className="text-sm">{session.assignedToName || 'Assigned'}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          View
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {filteredQueue.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No imports match your filters</p>
                {(statusFilter !== 'all' || assigneeFilter !== 'all' || searchQuery) && (
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => {
                      setStatusFilter('all');
                      setAssigneeFilter('all');
                      setSearchQuery('');
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
