import React, { useState } from 'react';
import {
  useItem,
  useItemHistory,
  useUpdateItem,
  useVerifyItem,
  useMarkNA,
  getStatusColor,
} from '@/api/dd';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Circle,
  Clock,
  Pause,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  FileText,
  Sparkles,
  Loader2,
  Upload,
  MessageSquare,
  History,
  Play,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

/**
 * Status options for dropdown
 */
const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started', icon: Circle, color: 'text-gray-400' },
  { value: 'IN_PROGRESS', label: 'In Progress', icon: Clock, color: 'text-blue-500' },
  { value: 'WAITING', label: 'Waiting', icon: Pause, color: 'text-amber-500' },
  { value: 'BLOCKED', label: 'Blocked', icon: AlertTriangle, color: 'text-red-500' },
  { value: 'COMPLETE', label: 'Complete', icon: CheckCircle2, color: 'text-green-500' },
  { value: 'N/A', label: 'Not Applicable', icon: MinusCircle, color: 'text-gray-300' },
];

/**
 * DDItemDetailSheet - Slide-out detail view for DD items
 *
 * Shows:
 * - AI Recommendation Banner (if applicable) with "Execute" button
 * - Essential Fields: Status, Assignee, Due date, Priority, Description
 * - Documents Section with upload
 * - Notes/History timeline
 * - Approval controls (if item requires approval)
 */
export function DDItemDetailSheet({
  open,
  onOpenChange,
  dealId,
  itemId,
  onStatusChange,
}) {
  const [noteText, setNoteText] = useState('');

  // Queries
  const { data: itemData, isLoading: itemLoading } = useItem(dealId, itemId, {
    enabled: !!dealId && !!itemId && open,
  });
  const { data: historyData, isLoading: historyLoading } = useItemHistory(dealId, itemId, {
    enabled: !!dealId && !!itemId && open,
  });

  // Mutations
  const updateMutation = useUpdateItem();
  const assignMutation = useAssignItem();
  const verifyMutation = useVerifyItem();
  const markNAMutation = useMarkNA();

  const item = itemData?.item;
  const history = historyData?.history || item?.history || [];

  const handleStatusChange = async (newStatus) => {
    try {
      await updateMutation.mutateAsync({
        dealId,
        itemId,
        status: newStatus,
      });
      toast.success(`Status updated to ${newStatus.toLowerCase().replace('_', ' ')}`);
      onStatusChange?.(itemId, newStatus);
    } catch (error) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;

    try {
      await updateMutation.mutateAsync({
        dealId,
        itemId,
        status: item.status,
        notes: noteText,
      });
      setNoteText('');
      toast.success('Note added');
    } catch (error) {
      toast.error(error.message || 'Failed to add note');
    }
  };

  const handleVerify = async () => {
    try {
      await verifyMutation.mutateAsync({ dealId, itemId });
      toast.success('Item verified');
    } catch (error) {
      toast.error(error.message || 'Failed to verify item');
    }
  };

  const handleMarkNA = async () => {
    const reason = window.prompt('Enter reason for marking as N/A:');
    if (!reason) return;

    try {
      await markNAMutation.mutateAsync({ dealId, itemId, reason });
      toast.success('Item marked as N/A');
    } catch (error) {
      toast.error(error.message || 'Failed to mark as N/A');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {itemLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : item ? (
          <div className="space-y-6">
            {/* Header */}
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Badge variant="outline" className="mb-2">
                    {item.categoryName || item.categoryCode}
                  </Badge>
                  <SheetTitle className="text-lg">{item.title || item.name}</SheetTitle>
                  {item.code && (
                    <SheetDescription className="text-xs mt-1">
                      Code: {item.code}
                    </SheetDescription>
                  )}
                </div>
                <Badge className={cn('ml-2', getStatusColor(item.status))}>
                  {formatStatus(item.status)}
                </Badge>
              </div>
            </SheetHeader>

            {/* AI Recommendation Banner */}
            {item.aiSuggestion && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-amber-800">AI Recommendation</h4>
                    <p className="text-sm text-amber-700 mt-1">{item.aiSuggestion.message}</p>
                    {item.aiSuggestion.action && (
                      <Button
                        size="sm"
                        className="mt-3 bg-amber-600 hover:bg-amber-700"
                        onClick={() => {
                          // Execute AI suggested action
                          if (item.aiSuggestion.action === 'COMPLETE') {
                            handleStatusChange('COMPLETE');
                          }
                        }}
                      >
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        {item.aiSuggestion.actionLabel || 'Execute'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div>
                <Label className="text-xs text-gray-500">Description</Label>
                <p className="text-sm text-gray-700 mt-1">{item.description}</p>
              </div>
            )}

            {/* Status */}
            <div>
              <Label className="text-xs text-gray-500">Status</Label>
              <Select value={item.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className={cn('h-4 w-4', opt.color)} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority & Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500">Priority</Label>
                <div className="mt-1">
                  <Badge variant={getPriorityVariant(item.priority)}>
                    {item.priority || 'MEDIUM'}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Due Date</Label>
                <div className="mt-1 text-sm">
                  {item.dueDate ? (
                    <span className={cn(
                      new Date(item.dueDate) < new Date() && item.status !== 'COMPLETE'
                        ? 'text-red-600 font-medium'
                        : 'text-gray-700'
                    )}>
                      {new Date(item.dueDate).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </div>
              </div>
            </div>

            {/* Assignee */}
            <div>
              <Label className="text-xs text-gray-500">Assignee</Label>
              <div className="mt-1 flex items-center gap-2">
                {item.assigneeName ? (
                  <>
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {item.assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{item.assigneeName}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400">Unassigned</span>
                )}
              </div>
            </div>

            {/* Documents */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">Documents</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  Upload
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {item.linkedDocuments && item.linkedDocuments.length > 0 ? (
                  item.linkedDocuments.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded border text-sm"
                    >
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="flex-1 truncate">{doc.name || doc.documentName}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs">
                        View
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">No documents linked</p>
                )}
              </div>
            </div>

            {/* Add Note */}
            <div>
              <Label className="text-xs text-gray-500">Add Note</Label>
              <div className="mt-1 flex gap-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note..."
                  className="min-h-[60px]"
                />
              </div>
              <Button
                size="sm"
                className="mt-2"
                onClick={handleAddNote}
                disabled={!noteText.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Add Note
              </Button>
            </div>

            {/* History */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-4 w-4 text-gray-400" />
                <Label className="text-xs text-gray-500">History</Label>
              </div>
              {historyLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : history.length > 0 ? (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {history.map((entry, idx) => (
                    <div key={idx} className="flex gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2" />
                      <div className="flex-1">
                        <p className="text-gray-700">{entry.action || entry.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {entry.userName || 'System'} &middot;{' '}
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No history yet</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-xs font-medium text-gray-500 mb-2">Quick Actions</h4>
              <div className="flex flex-wrap gap-2">
                {item.status !== 'COMPLETE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange('COMPLETE')}
                    disabled={updateMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
                    Mark Complete
                  </Button>
                )}
                {item.status !== 'BLOCKED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange('BLOCKED')}
                    disabled={updateMutation.isPending}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1 text-red-500" />
                    Mark Blocked
                  </Button>
                )}
                {!item.verifiedAt && item.status === 'COMPLETE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerify}
                    disabled={verifyMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Verify
                  </Button>
                )}
                {item.status !== 'N/A' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkNA}
                    disabled={markNAMutation.isPending}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    Mark N/A
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Item not found
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Format status for display
 */
function formatStatus(status) {
  const labels = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    WAITING: 'Waiting',
    BLOCKED: 'Blocked',
    COMPLETE: 'Complete',
    'N/A': 'N/A',
  };
  return labels[status] || status;
}

/**
 * Get priority badge variant
 */
function getPriorityVariant(priority) {
  const variants = {
    CRITICAL: 'destructive',
    HIGH: 'default',
    MEDIUM: 'secondary',
    LOW: 'outline',
  };
  return variants[priority] || variants.MEDIUM;
}

export default DDItemDetailSheet;
