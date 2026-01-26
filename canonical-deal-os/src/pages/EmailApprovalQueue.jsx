import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Loader2,
  AlertCircle,
  RefreshCw,
  Send,
  Sparkles,
  User,
  Building2,
  Calendar
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getEmailTypeBadge(emailType) {
  const types = {
    INVITATION: { label: 'Invitation', variant: 'default' },
    REMINDER_DAY3: { label: 'Day 3 Reminder', variant: 'secondary' },
    REMINDER_DAY7: { label: 'Day 7 Reminder', variant: 'secondary' },
    REMINDER_DAY14: { label: 'Final Reminder', variant: 'destructive' },
    ESCALATION: { label: 'Escalation', variant: 'destructive' }
  };
  const config = types[emailType] || { label: emailType, variant: 'outline' };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function getStatusBadge(status) {
  const statuses = {
    PENDING: { label: 'Pending', variant: 'default', icon: Clock },
    APPROVED: { label: 'Approved', variant: 'success', icon: CheckCircle2 },
    REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
    SENT: { label: 'Sent', variant: 'outline', icon: Send }
  };
  const config = statuses[status] || { label: status, variant: 'outline', icon: Mail };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function EmailApprovalQueue() {
  const queryClient = useQueryClient();
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  // Fetch pending email drafts
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['email-drafts', 'PENDING'],
    queryFn: async () => {
      const res = await fetch('/api/n8n/email-drafts?status=PENDING', {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch drafts');
      return res.json();
    }
  });

  // Fetch sent drafts (history)
  const { data: sentData, isLoading: sentLoading } = useQuery({
    queryKey: ['email-drafts', 'SENT'],
    queryFn: async () => {
      const res = await fetch('/api/n8n/email-drafts?status=SENT', {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch sent emails');
      return res.json();
    },
    enabled: activeTab === 'sent'
  });

  // Fetch single draft for preview
  const { data: draftDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['email-draft', selectedDraft?.id],
    queryFn: async () => {
      const res = await fetch(`/api/n8n/email-drafts/${selectedDraft.id}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch draft');
      return res.json();
    },
    enabled: !!selectedDraft?.id && previewOpen
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (draftId) => {
      const res = await fetch(`/api/n8n/email-drafts/${draftId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve');
      }
      return res.json();
    },
    onSuccess: () => {
      setPreviewOpen(false);
      setSelectedDraft(null);
      queryClient.invalidateQueries(['email-drafts']);
      setActionError('');
    },
    onError: (error) => {
      setActionError(error.message);
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ draftId, reason }) => {
      const res = await fetch(`/api/n8n/email-drafts/${draftId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject');
      }
      return res.json();
    },
    onSuccess: () => {
      setRejectDialogOpen(false);
      setPreviewOpen(false);
      setSelectedDraft(null);
      setRejectReason('');
      queryClient.invalidateQueries(['email-drafts']);
      setActionError('');
    },
    onError: (error) => {
      setActionError(error.message);
    }
  });

  const handleApprove = (draft) => {
    setActionError('');
    approveMutation.mutate(draft.id);
  };

  const handleRejectClick = (draft) => {
    setSelectedDraft(draft);
    setRejectDialogOpen(true);
    setRejectReason('');
    setActionError('');
  };

  const handleRejectConfirm = () => {
    if (!rejectReason.trim()) {
      setActionError('Please provide a reason for rejection');
      return;
    }
    rejectMutation.mutate({ draftId: selectedDraft.id, reason: rejectReason });
  };

  const handlePreview = (draft) => {
    setSelectedDraft(draft);
    setPreviewOpen(true);
    setActionError('');
  };

  const pendingDrafts = pendingData?.drafts || [];
  const sentDrafts = sentData?.drafts || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Email Approval Queue</h1>
          <p className="text-slate-500 mt-1">
            Review and approve AI-generated emails before they are sent to LPs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchPending()}
          disabled={pendingLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", pendingLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pending Approval</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingDrafts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Sent Today</CardTitle>
            <Send className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sentDrafts.filter(d => {
                const sent = new Date(d.sentAt);
                const today = new Date();
                return sent.toDateString() === today.toDateString();
              }).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">AI Generated</CardTitle>
            <Sparkles className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100%</div>
          </CardContent>
        </Card>
      </div>

      {/* Error Alert */}
      {actionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending ({pendingDrafts.length})
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" />
            Sent History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Emails Awaiting Approval</CardTitle>
              <CardDescription>
                Review each email and approve or reject before sending
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : pendingDrafts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm">No emails pending approval</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingDrafts.map((draft) => (
                      <TableRow key={draft.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-400" />
                            <div>
                              <div className="font-medium">{draft.recipientName || 'LP'}</div>
                              <div className="text-xs text-slate-500">{draft.recipientEmail}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getEmailTypeBadge(draft.emailType)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={draft.subject}>
                          {draft.subject}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {formatDate(draft.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(draft)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleApprove(draft)}
                              disabled={approveMutation.isPending}
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRejectClick(draft)}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
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

        <TabsContent value="sent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sent Emails</CardTitle>
              <CardDescription>History of approved and sent emails</CardDescription>
            </CardHeader>
            <CardContent>
              {sentLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : sentDrafts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No sent emails yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentDrafts.map((draft) => (
                      <TableRow key={draft.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-400" />
                            <div>
                              <div className="font-medium">{draft.recipientName || 'LP'}</div>
                              <div className="text-xs text-slate-500">{draft.recipientEmail}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getEmailTypeBadge(draft.emailType)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={draft.subject}>
                          {draft.subject}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {draft.approvedByName || 'System'}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {formatDate(draft.sentAt)}
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

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Preview
            </DialogTitle>
            <DialogDescription>
              Review the AI-generated email content before approving
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : draftDetail?.draft ? (
            <div className="space-y-4">
              {/* Email Metadata */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-xs text-slate-500 uppercase">To</div>
                  <div className="font-medium">{draftDetail.draft.recipientName}</div>
                  <div className="text-sm text-slate-500">{draftDetail.draft.recipientEmail}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase">Type</div>
                  <div className="mt-1">{getEmailTypeBadge(draftDetail.draft.emailType)}</div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <div className="text-xs text-slate-500 uppercase mb-1">Subject</div>
                <div className="font-medium text-lg">{draftDetail.draft.subject}</div>
              </div>

              {/* AI Badge */}
              {draftDetail.draft.aiGenerated && (
                <div className="flex items-center gap-2 text-sm text-purple-600">
                  <Sparkles className="h-4 w-4" />
                  AI-generated content
                </div>
              )}

              {/* Email Body */}
              <div className="border rounded-lg p-4 bg-white">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: draftDetail.draft.bodyHtml }}
                />
              </div>

              {/* AI Prompt (collapsible) */}
              {draftDetail.draft.aiPrompt && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    View AI prompt used
                  </summary>
                  <pre className="mt-2 p-3 bg-slate-100 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                    {draftDetail.draft.aiPrompt}
                  </pre>
                </details>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setPreviewOpen(false);
                handleRejectClick(selectedDraft);
              }}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              onClick={() => handleApprove(selectedDraft)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Approve & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Email</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this email. The workflow will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              placeholder="Reason for rejection (e.g., incorrect tone, missing information, needs revision)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
            {actionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
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
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
