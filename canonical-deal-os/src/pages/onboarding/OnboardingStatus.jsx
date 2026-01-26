import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { OnboardingStatusDashboard, OnboardingAIAssistant } from '@/components/onboarding';
import { bff } from '@/api/bffClient';

// Default empty states
const DEFAULT_STAGES = {
  processing: { count: 0, items: [] },
  spot_check: { count: 0, items: [] },
  team_review: { count: 0, items: [] },
  ready: { count: 0, items: [] }
};

export default function OnboardingStatus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get session ID from URL or localStorage
  const sessionId = searchParams.get('sessionId') || localStorage.getItem('onboarding_session_id');

  // State
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [activities, setActivities] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch session data
  const fetchSessionData = useCallback(async (showRefreshIndicator = false) => {
    if (!sessionId) return;

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const data = await bff.onboarding.getSession(sessionId);

      setSession(data.session || data);
      setCategories(data.categories || []);
      setStages(data.stages || DEFAULT_STAGES);
      setActivities(data.activities || []);

      // Extract questions from activities or separate endpoint
      const questionActivities = (data.activities || [])
        .filter(a => a.type === 'question' || a.type === 'AI_QUESTION')
        .map(a => ({
          id: a.id,
          question: a.message || a.details?.question,
          status: 'PENDING',
          quickResponses: a.details?.quickResponses || [],
          context: a.details?.context
        }));
      setQuestions(questionActivities);

      setError(null);
    } catch (err) {
      console.error('Failed to fetch session:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load session data');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sessionId]);

  // Initial load and polling
  useEffect(() => {
    if (!sessionId) {
      navigate('/onboarding');
      return;
    }

    fetchSessionData();

    // Poll for updates every 10 seconds while session is processing
    const interval = setInterval(() => {
      fetchSessionData(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [sessionId, fetchSessionData, navigate]);

  // Handlers
  const handleCategoryClick = (categoryName) => {
    navigate(`/onboarding/review?sessionId=${sessionId}&category=${categoryName}`);
  };

  const handleStageClick = (stageKey) => {
    navigate(`/onboarding/review?sessionId=${sessionId}&stage=${stageKey}`);
  };

  const handleStartReview = () => {
    navigate(`/onboarding/review?sessionId=${sessionId}`);
  };

  const handleRefresh = () => {
    fetchSessionData(true);
  };

  const handleAnswerQuestion = () => {
    setShowAIChat(true);
  };

  // Derived values
  const pendingQuestions = questions.filter(q => q.status === 'PENDING');
  const spotCheckCount = stages.spot_check?.count || 0;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  // No session found
  if (!session && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-slate-500 mb-4">
              We couldn't find an active onboarding session. Would you like to start a new import?
            </p>
            <Button onClick={() => navigate('/onboarding/wizard')}>
              Start New Import
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Import Status</h1>
              <p className="text-sm text-slate-500">
                {session?.status === 'PROCESSING'
                  ? 'Your data is being processed by our AI'
                  : session?.status === 'REVIEW'
                  ? 'Ready for your review'
                  : `Status: ${session?.status || 'Unknown'}`
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAIChat(!showAIChat)}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              AI Assistant
              {pendingQuestions.length > 0 && (
                <Badge className="ml-2 bg-amber-500">{pendingQuestions.length}</Badge>
              )}
            </Button>
            <Button onClick={handleStartReview}>
              Review Records
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button variant="link" className="ml-2 p-0 h-auto" onClick={handleRefresh}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* AI Question Alert */}
        {pendingQuestions.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-amber-100">
                  <HelpCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-amber-900 mb-1">AI needs your input</h3>
                  <p className="text-sm text-amber-700">
                    {pendingQuestions[0]?.question || 'The AI has questions about your data.'}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={handleAnswerQuestion}>
                  Answer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Dashboard */}
        <OnboardingStatusDashboard
          session={session}
          categories={categories}
          stages={stages}
          activities={activities}
          onCategoryClick={handleCategoryClick}
          onStageClick={handleStageClick}
        />

        {/* Ready for review CTA */}
        {spotCheckCount > 0 && (
          <Card className="mt-6 bg-blue-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-white/20">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {spotCheckCount} records ready for review
                    </h3>
                    <p className="text-blue-100">
                      Review and verify the extracted data
                    </p>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="bg-white text-blue-600 hover:bg-blue-50"
                  onClick={handleStartReview}
                >
                  Start Review
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI Assistant Component */}
      <OnboardingAIAssistant
        sessionId={sessionId}
        questions={questions}
        isOpen={showAIChat}
        onToggle={() => setShowAIChat(!showAIChat)}
        onAnswerQuestion={async (questionId, answer) => {
          try {
            await bff.onboarding.answerQuestion(sessionId, questionId, answer);
            // Remove answered question from local state
            setQuestions(prev => prev.filter(q => q.id !== questionId));
            return { success: true };
          } catch (err) {
            console.error('Failed to answer question:', err);
            return { success: false, error: err.message };
          }
        }}
        onDismissQuestion={async (questionId) => {
          try {
            await bff.onboarding.dismissQuestion(sessionId, questionId);
            setQuestions(prev => prev.filter(q => q.id !== questionId));
          } catch (err) {
            console.error('Failed to dismiss question:', err);
          }
        }}
        onSendMessage={async (message, questionId) => {
          try {
            const response = await bff.onboarding.chatWithAI(sessionId, message, questionId);
            return response;
          } catch (err) {
            console.error('Failed to send message:', err);
            return { message: 'Sorry, I encountered an error. Please try again.' };
          }
        }}
      />
    </div>
  );
}
