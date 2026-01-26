/**
 * Shared Space External - Public Portal
 *
 * Token-based access for external parties (no login required)
 *
 * Features:
 * - Simplified branded view
 * - View and download documents
 * - Send and view messages (if Collaborator)
 * - Upload documents (if Collaborator)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Users2,
  FileText,
  MessageSquare,
  Download,
  Lock,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Mail
} from 'lucide-react';
import { bff } from '../../api/bffClient';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export default function SharedSpaceExternal() {
  const { token } = useParams();

  const [space, setSpace] = useState(null);
  const [member, setMember] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Message input state
  const [messageContent, setMessageContent] = useState('');
  const [sending, setSending] = useState(false);

  const canSendMessages = member?.role === 'COLLABORATOR';
  const canUploadDocs = member?.role === 'COLLABORATOR';

  const validateAndLoad = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      // Validate token and get space info
      const tokenData = await bff.sharedSpaces.validateToken(token);
      setSpace(tokenData.space);
      setMember(tokenData.member);

      // Load documents
      const docsData = await bff.sharedSpaces.getExternalDocuments(token);
      setDocuments(docsData.documents || []);

      // Load messages
      const msgsData = await bff.sharedSpaces.getExternalMessages(token);
      setMessages(msgsData.messages || []);

      setError(null);
    } catch (err) {
      console.error('[SharedSpaceExternal] Failed to load:', err);
      setError(err.message || 'Invalid or expired access link');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    validateAndLoad();
  }, [validateAndLoad]);

  // Polling for message updates (10 seconds)
  useEffect(() => {
    if (!token || !space) return;

    const pollInterval = setInterval(async () => {
      try {
        const msgsData = await bff.sharedSpaces.getExternalMessages(token);
        setMessages(msgsData.messages || []);
      } catch (err) {
        console.error('[SharedSpaceExternal] Poll error:', err);
      }
    }, 10000); // 10 seconds

    return () => clearInterval(pollInterval);
  }, [token, space]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageContent.trim() || sending) return;

    setSending(true);
    try {
      await bff.sharedSpaces.sendExternalMessage(token, {
        content: messageContent.trim()
      });
      setMessageContent('');
      // Refresh messages
      const msgsData = await bff.sharedSpaces.getExternalMessages(token);
      setMessages(msgsData.messages || []);
    } catch (err) {
      console.error('[SharedSpaceExternal] Failed to send message:', err);
      alert('Failed to send message: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDownload = (doc) => {
    if (doc.documentUrl) {
      window.open(doc.documentUrl, '_blank');
    }
  };

  const handleRefresh = () => {
    validateAndLoad(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !space) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Lock className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Access Denied
            </h1>
            <p className="text-gray-600 mb-4">
              {error}
            </p>
            <p className="text-sm text-gray-500">
              Please check your invitation email for the correct access link,
              or contact the person who invited you.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = space.expiresAt && new Date(space.expiresAt) < new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Lock className="w-4 h-4" />
                <span>Secure Shared Space</span>
              </div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users2 className="w-6 h-6" />
                {space.name}
              </h1>
              {space.description && (
                <p className="text-gray-600 mt-1">{space.description}</p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {isExpired && (
                <Badge variant="destructive">Expired</Badge>
              )}
              <Badge variant="outline">
                <Mail className="w-3 h-3 mr-1" />
                {member.email}
              </Badge>
              <Badge variant="secondary">{member.role}</Badge>
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

          {/* Warning */}
          {isExpired && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <strong>This space has expired.</strong> You can view content but cannot make changes.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Documents Column */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Documents ({documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No documents available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-lg border hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {doc.title}
                        </span>
                      </div>
                      {doc.documentUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Messages Column */}
          <Card className="flex flex-col" style={{ maxHeight: '600px' }}>
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Discussion ({messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg ${msg.isExternal ? 'bg-blue-50' : 'bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {msg.authorName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(msg.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Message input */}
              {canSendMessages && !isExpired ? (
                <div className="border-t p-4">
                  <form onSubmit={handleSendMessage} className="space-y-2">
                    <textarea
                      value={messageContent}
                      onChange={(e) => setMessageContent(e.target.value)}
                      placeholder="Type a message..."
                      rows={3}
                      disabled={sending}
                      className="w-full px-3 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        {messageContent.length} characters
                      </span>
                      <Button
                        type="submit"
                        disabled={!messageContent.trim() || sending}
                        size="sm"
                      >
                        {sending ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="border-t p-4 bg-gray-50 text-center text-sm text-gray-500">
                  {isExpired
                    ? 'Space has expired - messages cannot be sent'
                    : 'You have viewer-only access'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
