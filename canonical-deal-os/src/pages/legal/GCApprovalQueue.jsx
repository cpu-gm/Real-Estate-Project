/**
 * GC Approval Queue Page
 *
 * Full page view for General Counsel to review and approve/reject matters
 */

import React, { useState, useEffect } from 'react';
import { bff } from '../../api/bffClient';
import { Scale, Clock, AlertCircle, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';

export default function GCApprovalQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedMatter, setSelectedMatter] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' or 'reject'
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadQueue();

    // Poll every 30 seconds
    const interval = setInterval(loadQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadQueue = async () => {
    try {
      const data = await bff.gcApproval.getQueue();
      setQueue(data.matters || []);
      setError(null);
    } catch (err) {
      console.error('[GCApprovalQueue] Failed to load queue:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = (matter) => {
    setSelectedMatter(matter);
    setActionType('approve');
    setNotes('');
  };

  const handleRejectClick = (matter) => {
    setSelectedMatter(matter);
    setActionType('reject');
    setNotes('');
  };

  const handleSubmitAction = async () => {
    if (!selectedMatter) return;

    if (actionType === 'reject' && !notes.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setSubmitting(true);
    try {
      if (actionType === 'approve') {
        await bff.gcApproval.approve(selectedMatter.id, notes);
      } else {
        await bff.gcApproval.reject(selectedMatter.id, notes);
      }

      // Reload queue
      await loadQueue();

      // Close dialog
      setSelectedMatter(null);
      setActionType(null);
      setNotes('');

      // Show success
      alert(`Matter ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
    } catch (err) {
      console.error(`[GCApprovalQueue] Failed to ${actionType}:`, err);
      alert(`Failed to ${actionType}: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toUpperCase()) {
      case 'URGENT': return 'bg-red-100 text-red-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'NORMAL': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDaysUntilDue = (dueDate) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">GC Approval Queue</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Scale className="h-8 w-8" />
          GC Approval Queue
          {queue.length > 0 && (
            <Badge variant="destructive" className="text-base">
              {queue.length}
            </Badge>
          )}
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-800 rounded">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {queue.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Scale className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg text-gray-500">No pending reviews</p>
            <p className="text-sm text-gray-400 mt-2">
              All matters have been reviewed. Great job!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {queue.map(matter => {
            const daysUntilDue = getDaysUntilDue(matter.dueDate);
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
            const isUrgent = daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0;

            return (
              <Card key={matter.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl">
                        {matter.title}
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {matter.matterType || 'Legal Matter'} • {matter.matterNumber || 'No number'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={getPriorityColor(matter.priority)}>
                        {matter.priority || 'NORMAL'}
                      </Badge>
                      {daysUntilDue !== null && (
                        <div className={`flex items-center gap-1 text-xs ${
                          isOverdue ? 'text-red-600 font-medium' :
                          isUrgent ? 'text-orange-600 font-medium' :
                          'text-gray-600'
                        }`}>
                          <Clock className="h-3 w-3" />
                          {isOverdue
                            ? `Overdue by ${Math.abs(daysUntilDue)}d`
                            : `Due in ${daysUntilDue}d`
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {matter.description && (
                    <p className="text-sm text-gray-700 mb-4">
                      {matter.description}
                    </p>
                  )}

                  {matter.activities && matter.activities.length > 0 && (
                    <div className="bg-gray-50 p-3 rounded mb-4">
                      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Recent Activity
                      </p>
                      {matter.activities.slice(0, 2).map(activity => (
                        <p key={activity.id} className="text-xs text-gray-600 mb-1">
                          • {activity.content}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApproveClick(matter)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRejectClick(matter)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.href = `/LegalMatterDetail/${matter.id}`}
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Approve/Reject Dialog */}
      <Dialog
        open={selectedMatter !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMatter(null);
            setActionType(null);
            setNotes('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Matter' : 'Reject Matter'}
            </DialogTitle>
          </DialogHeader>

          {selectedMatter && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Matter:</p>
                <p className="text-sm text-gray-900">{selectedMatter.title}</p>
              </div>

              <div>
                <Label htmlFor="notes">
                  {actionType === 'approve' ? 'Approval Notes (optional)' : 'Rejection Reason (required)'}
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    actionType === 'approve'
                      ? 'Optional notes for the requester...'
                      : 'Please explain why this matter is being rejected...'
                  }
                  rows={4}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedMatter(null);
                setActionType(null);
                setNotes('');
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              onClick={handleSubmitAction}
              disabled={submitting || (actionType === 'reject' && !notes.trim())}
            >
              {submitting ? 'Submitting...' : (actionType === 'approve' ? 'Approve' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
