/**
 * ApprovalQueueWidget
 *
 * Shows pending GC reviews with quick actions
 * Used on GPCounselHome (General Counsel only)
 */

import React, { useState, useEffect } from 'react';
import { bff } from '../../api/bffClient';
import { Scale, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export default function ApprovalQueueWidget({ onViewAll }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadQueue();

    // Poll every 30 seconds for real-time updates
    const interval = setInterval(loadQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadQueue = async () => {
    try {
      const data = await bff.gcApproval.getQueue();
      setQueue(data.matters || []);
      setError(null);
    } catch (err) {
      console.error('[ApprovalQueueWidget] Failed to load queue:', err);
      setError(err.message);
    } finally {
      setLoading(false);
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Approval Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Approval Queue
            {queue.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {queue.length}
              </Badge>
            )}
          </CardTitle>
          {queue.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewAll}
            >
              View All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-800 rounded mb-4">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {queue.length === 0 ? (
          <p className="text-sm text-gray-500">No pending reviews</p>
        ) : (
          <div className="space-y-3">
            {queue.slice(0, 3).map(matter => {
              const daysUntilDue = getDaysUntilDue(matter.dueDate);
              const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
              const isUrgent = daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0;

              return (
                <div
                  key={matter.id}
                  className="p-3 border rounded hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => window.location.href = `/LegalMatterDetail/${matter.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {matter.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {matter.matterType || 'Legal Matter'}
                      </p>
                    </div>
                    <Badge className={getPriorityColor(matter.priority)}>
                      {matter.priority || 'NORMAL'}
                    </Badge>
                  </div>

                  {daysUntilDue !== null && (
                    <div className={`flex items-center gap-1 mt-2 text-xs ${
                      isOverdue ? 'text-red-600 font-medium' :
                      isUrgent ? 'text-orange-600 font-medium' :
                      'text-gray-600'
                    }`}>
                      <Clock className="h-3 w-3" />
                      {isOverdue
                        ? `Overdue by ${Math.abs(daysUntilDue)} day(s)`
                        : `Due in ${daysUntilDue} day(s)`
                      }
                    </div>
                  )}
                </div>
              );
            })}

            {queue.length > 3 && (
              <p className="text-xs text-gray-500 text-center pt-2">
                + {queue.length - 3} more awaiting review
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
