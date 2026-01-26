import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  Mail,
  MoreHorizontal,
  Loader2,
  AlertCircle,
  UserCheck,
  UserX,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useBulkSelection } from '@/lib/hooks/useBulkSelection';
import { BulkActionBar, BulkProgressModal } from '@/components/bulk';
import { createLogger } from '@/lib/debug-logger';
import toast from 'react-hot-toast';

const logger = createLogger('ui:bulk-ops');

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState('');

  // Bulk selection state for verification queue
  const {
    selectedIds,
    isSelected,
    toggle,
    toggleRange,
    selectAll,
    clearSelection,
    selectionCount
  } = useBulkSelection();

  // Bulk progress modal state
  const [bulkProgress, setBulkProgress] = useState(null);

  // Fetch verification queue
  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ['verification-queue'],
    queryFn: async () => {
      const res = await fetch('/api/admin/verification-queue', {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch queue');
      return res.json();
    }
  });

  // Fetch all users
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (requestId) => {
      const res = await fetch(`/api/admin/verification-requests/${requestId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to approve');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['verification-queue']);
      queryClient.invalidateQueries(['admin-users']);
      setActionError('');
    },
    onError: (err) => {
      setActionError(err.message);
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, note }) => {
      const res = await fetch(`/api/admin/verification-requests/${requestId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to reject');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['verification-queue']);
      queryClient.invalidateQueries(['admin-users']);
      setRejectDialogOpen(false);
      setRejectNote('');
      setSelectedRequest(null);
      setActionError('');
    },
    onError: (err) => {
      setActionError(err.message);
    }
  });

  // Update user status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, status }) => {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-users']);
      setActionError('');
    },
    onError: (err) => {
      setActionError(err.message);
    }
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (requestIds) => {
      logger.debug('Bulk approve started', { action: 'approve', itemCount: requestIds.length, itemIds: requestIds });
      setBulkProgress({
        total: requestIds.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        isComplete: false
      });

      const res = await fetch('/api/admin/verification-requests/bulk-approve', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requestIds })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to bulk approve');
      }

      const result = await res.json();

      setBulkProgress({
        total: requestIds.length,
        completed: requestIds.length,
        succeeded: result.succeeded?.length || 0,
        failed: result.failed?.length || 0,
        errors: result.failed || [],
        isComplete: true
      });

      logger.debug('Bulk approve complete', {
        action: 'approve',
        successCount: result.succeeded?.length || 0,
        failCount: result.failed?.length || 0
      });

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(['verification-queue']);
      queryClient.invalidateQueries(['admin-users']);
      if (result.succeeded?.length > 0) {
        toast.success(`Approved ${result.succeeded.length} user(s)`);
      }
      if (result.failed?.length > 0) {
        toast.error(`Failed to approve ${result.failed.length} user(s)`);
      }
      clearSelection();
      setActionError('');
    },
    onError: (err) => {
      logger.error('Bulk approve failed', { error: err.message });
      toast.error('Failed to approve users');
      setBulkProgress(prev => prev ? { ...prev, isComplete: true } : null);
      setActionError(err.message);
    }
  });

  // Bulk reject mutation
  const bulkRejectMutation = useMutation({
    mutationFn: async ({ requestIds, note }) => {
      logger.debug('Bulk reject started', { action: 'reject', itemCount: requestIds.length, itemIds: requestIds });
      setBulkProgress({
        total: requestIds.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        isComplete: false
      });

      const res = await fetch('/api/admin/verification-requests/bulk-reject', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requestIds, note })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to bulk reject');
      }

      const result = await res.json();

      setBulkProgress({
        total: requestIds.length,
        completed: requestIds.length,
        succeeded: result.succeeded?.length || 0,
        failed: result.failed?.length || 0,
        errors: result.failed || [],
        isComplete: true
      });

      logger.debug('Bulk reject complete', {
        action: 'reject',
        successCount: result.succeeded?.length || 0,
        failCount: result.failed?.length || 0
      });

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(['verification-queue']);
      queryClient.invalidateQueries(['admin-users']);
      if (result.succeeded?.length > 0) {
        toast.success(`Rejected ${result.succeeded.length} user(s)`);
      }
      if (result.failed?.length > 0) {
        toast.error(`Failed to reject ${result.failed.length} user(s)`);
      }
      clearSelection();
      setActionError('');
    },
    onError: (err) => {
      logger.error('Bulk reject failed', { error: err.message });
      toast.error('Failed to reject users');
      setBulkProgress(prev => prev ? { ...prev, isComplete: true } : null);
      setActionError(err.message);
    }
  });

  function handleApprove(requestId) {
    approveMutation.mutate(requestId);
  }

  function handleRejectClick(request) {
    setSelectedRequest(request);
    setRejectDialogOpen(true);
  }

  function handleRejectConfirm() {
    if (selectedRequest) {
      rejectMutation.mutate({ requestId: selectedRequest.id, note: rejectNote });
    }
  }

  function handleToggleStatus(user) {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    updateStatusMutation.mutate({ userId: user.id, status: newStatus });
  }

  // Handle bulk approve action
  function handleBulkApprove() {
    logger.debug('Bulk approve initiated', { selectedIds: [...selectedIds], count: selectionCount });
    bulkApproveMutation.mutate([...selectedIds]);
  }

  // Handle bulk reject action
  function handleBulkReject() {
    logger.debug('Bulk reject initiated', { selectedIds: [...selectedIds], count: selectionCount });
    bulkRejectMutation.mutate({ requestIds: [...selectedIds], note: '' });
  }

  // Handle select all in queue
  function handleSelectAllInQueue() {
    const allRequestIds = queueData?.requests?.map(r => r.id) || [];
    selectAll(allRequestIds);
  }

  const pendingCount = queueData?.requests?.length || 0;
  const activeCount = usersData?.users?.filter(u => u.status === 'ACTIVE').length || 0;
  const totalCount = usersData?.users?.length || 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-600">Manage users and verification requests</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            refetchQueue();
            refetchUsers();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {actionError && (
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-amber-100">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-slate-500">Pending Verification</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100">
                <UserCheck className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-slate-500">Active Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-sm text-slate-500">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending Verification
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-amber-500 hover:bg-amber-500">{pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users">All Users</TabsTrigger>
        </TabsList>

        {/* Pending Verification Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Verification Queue</CardTitle>
              <CardDescription>
                Review and approve pending user registrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queueLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : pendingCount === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-3" />
                  <p className="text-slate-600">No pending verification requests</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={queueData?.requests?.length > 0 && selectionCount === queueData.requests.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              handleSelectAllInQueue();
                            } else {
                              clearSelection();
                            }
                          }}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueData.requests.map((request, index) => (
                      <TableRow key={request.id} className={isSelected(request.id) ? 'bg-blue-50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected(request.id)}
                            onCheckedChange={() => toggle(request.id)}
                            aria-label={`Select ${request.user.name}`}
                            data-testid="user-checkbox"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-slate-600">
                                {request.user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{request.user.name}</p>
                              <p className="text-sm text-slate-500">{request.user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{request.requestedRole}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(request.id)}
                              disabled={approveMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="mr-1 h-4 w-4" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRejectClick(request)}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">User Management</CardTitle>
              <CardDescription>
                View and manage all users in your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : usersData?.users?.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto h-12 w-12 text-slate-400 mb-3" />
                  <p className="text-slate-600">No users found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersData?.users?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-slate-600">
                                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            user.role === 'Admin' && 'bg-purple-50 text-purple-700 border-purple-200'
                          )}>
                            {user.role === 'Admin' && <Shield className="mr-1 h-3 w-3" />}
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              user.status === 'ACTIVE' && 'bg-green-50 text-green-700 border-green-200',
                              user.status === 'PENDING' && 'bg-amber-50 text-amber-700 border-amber-200',
                              user.status === 'SUSPENDED' && 'bg-red-50 text-red-700 border-red-200'
                            )}
                          >
                            {user.status === 'ACTIVE' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {user.status === 'PENDING' && <Clock className="mr-1 h-3 w-3" />}
                            {user.status === 'SUSPENDED' && <XCircle className="mr-1 h-3 w-3" />}
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {user.status !== 'PENDING' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                                    {user.status === 'ACTIVE' ? (
                                      <>
                                        <UserX className="mr-2 h-4 w-4" />
                                        Suspend User
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="mr-2 h-4 w-4" />
                                        Activate User
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem className="text-slate-500" disabled>
                                <Mail className="mr-2 h-4 w-4" />
                                Send Email
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this user's verification request?
              {selectedRequest && (
                <span className="block mt-2 font-medium text-slate-900">
                  {selectedRequest.user.name} ({selectedRequest.user.email})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              placeholder="Enter a reason for rejection..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reject User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selectionCount}
        actions={[
          {
            label: 'Approve All',
            onClick: handleBulkApprove,
            icon: CheckCircle2,
            variant: 'default',
            'data-testid': 'bulk-approve-button'
          },
          {
            label: 'Reject All',
            onClick: handleBulkReject,
            icon: XCircle,
            variant: 'destructive',
            'data-testid': 'bulk-reject-button'
          }
        ]}
        onClear={clearSelection}
      />

      {/* Bulk Progress Modal */}
      <BulkProgressModal
        isOpen={!!bulkProgress}
        onClose={() => setBulkProgress(null)}
        progress={bulkProgress}
        title={bulkApproveMutation.isPending ? "Approving Users" : "Rejecting Users"}
        itemLabel="user"
      />
    </div>
  );
}
