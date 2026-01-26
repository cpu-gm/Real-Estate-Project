/**
 * Shared Space Detail - 3-Column Layout
 *
 * Members | Documents | Discussion
 *
 * Main collaboration workspace with:
 * - Members list with role management
 * - Documents with link/upload/external URL
 * - Threaded messaging with @mentions, reactions, file attachments
 * - Real-time polling (5-10 sec) for message updates
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users2,
  FileText,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  Settings,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { bff } from '../../api/bffClient';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import MembersList from '../../components/shared-spaces/MembersList';
import DocumentsList from '../../components/shared-spaces/DocumentsList';
import MessageThread from '../../components/shared-spaces/MessageThread';

export default function SharedSpaceDetail() {
  const { id: spaceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [space, setSpace] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Determine user's role in this space
  const userMember = space?.members?.find(m => m.userId === user?.id);
  const userRole = userMember?.role || null;
  const isOwner = userRole === 'OWNER';
  const isCollaborator = userRole === 'COLLABORATOR';
  const canManageMembers = isOwner;
  const canAddDocuments = isOwner || isCollaborator;
  const canSendMessages = isOwner || isCollaborator;

  const loadSpace = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const data = await bff.sharedSpaces.get(spaceId);
      setSpace(data.space);
      setMessages(data.space.messages || []);
      setError(null);
    } catch (err) {
      console.error('[SharedSpaceDetail] Failed to load space:', err);
      setError(err.message || 'Failed to load shared space');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [spaceId]);

  // Initial load
  useEffect(() => {
    loadSpace();
  }, [loadSpace]);

  // Polling for real-time message updates (5 seconds)
  useEffect(() => {
    if (!spaceId || !space) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await bff.sharedSpaces.getMessages(spaceId);
        setMessages(data.messages || []);
      } catch (err) {
        console.error('[SharedSpaceDetail] Poll error:', err);
      }
    }, 5000); // 5 seconds

    return () => clearInterval(pollInterval);
  }, [spaceId, space]);

  const handleBack = () => {
    navigate('/SharedSpacesList');
  };

  const handleRefresh = () => {
    loadSpace(true);
  };

  const handleMemberAdded = () => {
    loadSpace(true);
  };

  const handleMemberRemoved = () => {
    loadSpace(true);
  };

  const handleDocumentAdded = () => {
    loadSpace(true);
  };

  const handleDocumentRemoved = () => {
    loadSpace(true);
  };

  const handleMessageSent = (newMessage) => {
    // Optimistic update
    setMessages(prev => [newMessage, ...prev]);
    // Refresh to get full data
    setTimeout(() => loadSpace(false), 500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !space) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading shared space</h3>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => loadSpace()}
              className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Retry
            </button>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isExpired = space.expiresAt && new Date(space.expiresAt) < new Date();
  const isInactive = !space.isActive || isExpired;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users2 className="w-6 h-6" />
                {space.name}
              </h1>
              {space.description && (
                <p className="text-gray-600 text-sm mt-1">{space.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {isInactive && (
              <Badge variant="destructive">
                {isExpired ? 'Expired' : 'Inactive'}
              </Badge>
            )}
            {userRole && (
              <Badge variant="outline">
                {userRole}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Warning for inactive space */}
        {isInactive && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <strong>Space is {isExpired ? 'expired' : 'inactive'}.</strong>
              {' '}Members can view content but cannot make changes.
            </div>
          </div>
        )}
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Column 1: Members (3/12 width) */}
        <div className="col-span-3 flex flex-col overflow-hidden">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users2 className="w-5 h-5" />
                Members ({space.members?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <MembersList
                space={space}
                userRole={userRole}
                canManageMembers={canManageMembers}
                onMemberAdded={handleMemberAdded}
                onMemberRemoved={handleMemberRemoved}
              />
            </CardContent>
          </Card>
        </div>

        {/* Column 2: Documents (3/12 width) */}
        <div className="col-span-3 flex flex-col overflow-hidden">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Documents ({space.documents?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <DocumentsList
                space={space}
                userRole={userRole}
                canAddDocuments={canAddDocuments}
                onDocumentAdded={handleDocumentAdded}
                onDocumentRemoved={handleDocumentRemoved}
              />
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Discussion (6/12 width) */}
        <div className="col-span-6 flex flex-col overflow-hidden">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Discussion ({messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <MessageThread
                space={space}
                messages={messages}
                userRole={userRole}
                canSendMessages={canSendMessages}
                onMessageSent={handleMessageSent}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
