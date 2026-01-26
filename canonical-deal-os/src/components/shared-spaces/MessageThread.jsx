/**
 * Message Thread - Threaded discussion
 *
 * Features:
 * - Threaded messages with replies (parentId)
 * - @mentions support
 * - Message composer at bottom
 * - Shows internal vs external authors
 * - Real-time updates via polling (handled by parent)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  User,
  Mail,
  Reply,
  Clock,
  ChevronRight
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import MessageInput from './MessageInput';

export default function MessageThread({
  space,
  messages,
  userRole,
  canSendMessages,
  onMessageSent
}) {
  const [replyingTo, setReplyingTo] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Organize messages by threads
  const topLevelMessages = messages.filter(m => !m.parentId);
  const getReplies = (parentId) => messages.filter(m => m.parentId === parentId);

  const handleReply = (message) => {
    setReplyingTo(message);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleMessageSent = (newMessage) => {
    setReplyingTo(null);
    onMessageSent(newMessage);
  };

  // Render a single message
  const renderMessage = (message, isReply = false) => {
    const isExternal = message.isExternal;
    const replies = getReplies(message.id);

    return (
      <div key={message.id} className={`${isReply ? 'ml-8 mt-2' : 'mt-4'}`}>
        <div className={`p-3 rounded-lg ${isExternal ? 'bg-blue-50' : 'bg-gray-50'}`}>
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {isExternal ? (
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
              )}
              <div>
                <span className="text-sm font-medium">
                  {message.authorName}
                </span>
                {isExternal && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    External
                  </Badge>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {new Date(message.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            {!isReply && canSendMessages && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReply(message)}
              >
                <Reply className="w-3 h-3 mr-1" />
                Reply
              </Button>
            )}
          </div>

          {/* Content */}
          <div
            className="text-sm whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: renderContent(message.content)
            }}
          />
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {replies.map(reply => renderMessage(reply, true))}
          </div>
        )}
      </div>
    );
  };

  // Render content with @mentions highlighted
  const renderContent = (text) => {
    // Escape HTML to prevent XSS
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Highlight @mentions
    return escaped.replace(
      /@(\w+)/g,
      '<span class="text-blue-600 font-medium">@$1</span>'
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No messages yet</p>
            {canSendMessages && (
              <p className="text-xs mt-1">Start the conversation below</p>
            )}
          </div>
        ) : (
          <>
            {topLevelMessages.map(message => renderMessage(message))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message composer */}
      {canSendMessages && (
        <div className="border-t p-4">
          <MessageInput
            space={space}
            replyingTo={replyingTo}
            onCancelReply={handleCancelReply}
            onMessageSent={handleMessageSent}
          />
        </div>
      )}

      {/* Cannot send (viewer) */}
      {!canSendMessages && (
        <div className="border-t p-4 bg-gray-50 text-center text-sm text-gray-500">
          You have viewer-only access. Contact the space owner to request collaboration access.
        </div>
      )}
    </div>
  );
}
