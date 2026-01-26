import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Send,
  X,
  Minimize2,
  Maximize2,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  Loader2,
  Bot,
  User,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  ExternalLink
} from 'lucide-react';

/**
 * OnboardingAIAssistant - Floating chat panel for AI-assisted onboarding
 *
 * Features:
 * - Real-time questions when AI needs clarification
 * - Quick response buttons for common answers
 * - Free-form text input for complex responses
 * - Message history with AI/user distinction
 * - Minimized/expanded states
 * - Question queue with priority indicators
 */
export function OnboardingAIAssistant({
  sessionId,
  questions = [],
  onAnswerQuestion,
  onDismissQuestion,
  onSendMessage,
  isOpen,
  onToggle,
  className = ''
}) {
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Set active question when questions change
  useEffect(() => {
    if (questions.length > 0 && !activeQuestion) {
      setActiveQuestion(questions[0]);
    }
  }, [questions]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await onSendMessage?.(inputValue, activeQuestion?.id);

      if (response) {
        const aiMessage = {
          id: Date.now() + 1,
          type: 'ai',
          content: response.message,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
      }

      // Clear active question if it was answered
      if (activeQuestion) {
        setActiveQuestion(null);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickResponse = async (response) => {
    if (!activeQuestion) return;

    setIsSending(true);

    // Add user message
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: response.label,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      await onAnswerQuestion?.(activeQuestion.id, response.value);

      // Add confirmation message
      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: `Got it! I'll use "${response.label}" for this. ${
          questions.length > 1 ? "Let me ask you about the next item..." : "Thanks for the clarification!"
        }`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);

      // Move to next question
      const remainingQuestions = questions.filter(q => q.id !== activeQuestion.id);
      setActiveQuestion(remainingQuestions[0] || null);
    } finally {
      setIsSending(false);
    }
  };

  const handleDismiss = async () => {
    if (!activeQuestion) return;

    await onDismissQuestion?.(activeQuestion.id);

    const remainingQuestions = questions.filter(q => q.id !== activeQuestion.id);
    setActiveQuestion(remainingQuestions[0] || null);
  };

  const pendingCount = questions.filter(q => q.status === 'PENDING').length;

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={`fixed bottom-6 right-6 p-4 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors z-50 ${className}`}
      >
        <MessageSquare className="w-6 h-6" />
        {pendingCount > 0 && (
          <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white">
            {pendingCount}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <Card className={`fixed bottom-6 right-6 w-96 shadow-2xl border-slate-200 z-50 flex flex-col ${
      isExpanded ? 'h-[600px]' : 'h-auto'
    } ${className}`}>
      {/* Header */}
      <CardHeader className="pb-2 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-blue-100">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <CardTitle className="text-base">AI Assistant</CardTitle>
            {pendingCount > 0 && (
              <Badge className="bg-amber-500">{pendingCount} questions</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onToggle}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <>
          {/* Active Question */}
          {activeQuestion && (
            <div className="p-3 bg-amber-50 border-b border-amber-200 flex-shrink-0">
              <div className="flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    {activeQuestion.question}
                  </p>

                  {/* Quick responses */}
                  {activeQuestion.quickResponses && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {activeQuestion.quickResponses.map((response, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleQuickResponse(response)}
                          disabled={isSending}
                        >
                          {response.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Context info */}
                  {activeQuestion.context && (
                    <p className="text-xs text-amber-700">
                      <strong>Context:</strong> {activeQuestion.context}
                    </p>
                  )}

                  {/* Skip option */}
                  <button
                    onClick={handleDismiss}
                    className="text-xs text-amber-600 hover:underline mt-1"
                  >
                    Skip this question
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-4">
              {/* Welcome message */}
              {messages.length === 0 && !activeQuestion && (
                <div className="text-center py-8 text-slate-500">
                  <Bot className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">I'm here to help!</p>
                  <p className="text-sm">
                    I'll ask questions when I need clarification about your data.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {isSending && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={isSending}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!inputValue.trim() || isSending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * MessageBubble - Individual message display
 */
function MessageBubble({ message }) {
  const isAI = message.type === 'ai';

  return (
    <div className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] ${isAI ? 'order-2' : 'order-1'}`}>
        <div
          className={`rounded-lg px-3 py-2 ${
            isAI
              ? 'bg-slate-100 text-slate-900'
              : 'bg-blue-600 text-white'
          }`}
        >
          <p className="text-sm">{message.content}</p>
        </div>
        <p className={`text-xs mt-1 ${isAI ? 'text-left' : 'text-right'} text-slate-400`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className={`flex-shrink-0 ${isAI ? 'order-1 mr-2' : 'order-2 ml-2'}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isAI ? 'bg-blue-100' : 'bg-slate-200'
        }`}>
          {isAI ? (
            <Bot className="w-4 h-4 text-blue-600" />
          ) : (
            <User className="w-4 h-4 text-slate-600" />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * AIQuestionCard - Standalone question card for inline display
 */
export function AIQuestionCard({
  question,
  onAnswer,
  onDismiss,
  className = ''
}) {
  const [customAnswer, setCustomAnswer] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);

  const handleQuickAnswer = async (response) => {
    setIsAnswering(true);
    try {
      await onAnswer?.(question.id, response.value, response.label);
    } finally {
      setIsAnswering(false);
    }
  };

  const handleCustomAnswer = async () => {
    if (!customAnswer.trim()) return;
    setIsAnswering(true);
    try {
      await onAnswer?.(question.id, customAnswer, customAnswer);
      setCustomAnswer('');
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <Card className={`border-amber-200 bg-amber-50 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-amber-100 flex-shrink-0">
            <HelpCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-amber-900 mb-3">{question.question}</p>

            {/* Quick responses */}
            {question.quickResponses && question.quickResponses.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {question.quickResponses.map((response, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAnswer(response)}
                    disabled={isAnswering}
                    className="bg-white"
                  >
                    {response.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Custom answer input */}
            <div className="flex items-center gap-2">
              <Input
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                placeholder="Or type your answer..."
                disabled={isAnswering}
                className="bg-white"
                onKeyDown={(e) => e.key === 'Enter' && handleCustomAnswer()}
              />
              <Button
                size="sm"
                onClick={handleCustomAnswer}
                disabled={!customAnswer.trim() || isAnswering}
              >
                {isAnswering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>

            {/* Context and skip */}
            <div className="flex items-center justify-between mt-3 text-xs">
              {question.context && (
                <span className="text-amber-700">
                  Related to: {question.context}
                </span>
              )}
              <button
                onClick={() => onDismiss?.(question.id)}
                className="text-amber-600 hover:underline"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AIInsightCard - Display AI insights/suggestions
 */
export function AIInsightCard({
  insight,
  onAccept,
  onDismiss,
  className = ''
}) {
  return (
    <Card className={`border-blue-200 bg-blue-50 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-blue-100 flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-blue-900">{insight.title}</span>
              <Badge variant="outline" className="text-blue-600">
                {Math.round((insight.confidence || 0) * 100)}% confident
              </Badge>
            </div>
            <p className="text-sm text-blue-800 mb-3">{insight.description}</p>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onAccept?.(insight)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDismiss?.(insight)}
              >
                <ThumbsDown className="w-4 h-4 mr-1" />
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AIProgressIndicator - Shows AI processing status
 */
export function AIProgressIndicator({
  status,
  currentTask,
  progress,
  className = ''
}) {
  const statusConfig = {
    idle: { icon: Bot, color: 'text-slate-400', label: 'Idle' },
    processing: { icon: Loader2, color: 'text-blue-600', label: 'Processing', animate: true },
    waiting: { icon: HelpCircle, color: 'text-amber-600', label: 'Waiting for input' },
    complete: { icon: CheckCircle2, color: 'text-green-600', label: 'Complete' },
    error: { icon: AlertTriangle, color: 'text-red-600', label: 'Error' }
  };

  const config = statusConfig[status] || statusConfig.idle;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Icon className={`w-4 h-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
      <span className="text-sm text-slate-600">
        {currentTask || config.label}
      </span>
      {progress !== undefined && (
        <span className="text-xs text-slate-400">({progress}%)</span>
      )}
    </div>
  );
}

export default OnboardingAIAssistant;
