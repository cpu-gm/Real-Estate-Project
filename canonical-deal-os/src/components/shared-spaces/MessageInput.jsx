/**
 * Message Input - Compose and send messages
 *
 * Features:
 * - Rich text input with @mentions
 * - File attachment references (links to space documents)
 * - Reply threading
 * - Send on Ctrl+Enter
 */

import React, { useState, useRef } from 'react';
import {
  Send,
  X,
  Paperclip,
  Reply,
  Loader2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { bff } from '../../api/bffClient';

export default function MessageInput({
  space,
  replyingTo,
  onCancelReply,
  onMessageSent
}) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  const handleSend = async () => {
    if (!content.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      const messageData = {
        content: content.trim(),
        parentId: replyingTo?.id || null
      };

      const result = await bff.sharedSpaces.sendMessage(space.id, messageData);

      setContent('');
      onMessageSent(result.message);
    } catch (err) {
      console.error('[MessageInput] Failed to send message:', err);
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    // Send on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // Parse @mentions from input
  const handleMention = (username) => {
    setContent(prev => prev + `@${username} `);
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {/* Replying indicator */}
      {replyingTo && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
          <Reply className="w-4 h-4 text-blue-500" />
          <span className="text-sm text-blue-700 flex-1">
            Replying to <strong>{replyingTo.authorName}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelReply}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <p className="text-red-800 text-xs">{error}</p>
        </div>
      )}

      {/* Input area */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder="Type a message... (Ctrl+Enter to send, @ to mention)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={sending}
          className="resize-none pr-12"
        />

        {/* Send button (overlay) */}
        <div className="absolute bottom-2 right-2">
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!content.trim() || sending}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Helper text */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span>Ctrl+Enter to send</span>
          <span>@ to mention someone</span>
        </div>
        <span>{content.length} characters</span>
      </div>

      {/* Future: Attach document reference */}
      {/* <div className="flex gap-2">
        <Button variant="ghost" size="sm" title="Attach document">
          <Paperclip className="w-4 h-4" />
        </Button>
      </div> */}
    </div>
  );
}
