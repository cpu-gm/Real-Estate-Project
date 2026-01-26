import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  RefreshCw,
  Users,
  FileText,
  Link2,
  MessageSquare,
  Activity,
  Loader2,
  Send,
  Briefcase,
  DollarSign,
  Home
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { bff } from '@/api/bffClient';

const STATUS_CONFIG = {
  SETUP: { label: 'Setup', color: 'bg-slate-100 text-slate-700' },
  UPLOADING: { label: 'Uploading', color: 'bg-slate-100 text-slate-700' },
  PROCESSING: { label: 'Processing', color: 'bg-blue-100 text-blue-700' },
  REVIEW: { label: 'Customer Review', color: 'bg-amber-100 text-amber-700' },
  TEAM_REVIEW: { label: 'Team Review', color: 'bg-purple-100 text-purple-700' },
  READY: { label: 'Ready', color: 'bg-green-100 text-green-700' },
  LIVE: { label: 'Live', color: 'bg-slate-100 text-slate-700' }
};

const NOTE_TYPE_CONFIG = {
  GENERAL: { label: 'General', color: 'bg-slate-100 text-slate-700' },
  ESCALATION: { label: 'Escalation', color: 'bg-red-100 text-red-700' },
  SLA: { label: 'SLA', color: 'bg-amber-100 text-amber-700' },
  QUALITY: { label: 'Quality', color: 'bg-blue-100 text-blue-700' },
  QUESTION: { label: 'Question', color: 'bg-purple-100 text-purple-700' }
};

const CATEGORY_ICONS = {
  deals: Briefcase,
  properties: Home,
  contacts: Users,
  financials: DollarSign,
  documents: FileText,
  lp_records: Users
};

function getSLAStatus(deadline) {
  if (!deadline) {
    return { status: 'none', label: 'No SLA', color: 'text-slate-400', icon: Clock };
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);

  if (hoursRemaining < 0) {
    return { status: 'overdue', label: 'Overdue', color: 'text-red-600 bg-red-50', icon: AlertTriangle };
  } else if (hoursRemaining < 4) {
    return { status: 'urgent', label: `${Math.ceil(hoursRemaining)}h remaining`, color: 'text-amber-600 bg-amber-50', icon: Clock };
  } else {
    return { status: 'ok', label: `${Math.ceil(hoursRemaining)}h remaining`, color: 'text-green-600 bg-green-50', icon: CheckCircle2 };
  }
}

// Activity item component
function ActivityItem({ activity }) {
  const getIcon = (type) => {
    switch (type) {
      case 'EXTRACTION_COMPLETE': return CheckCircle2;
      case 'CLAIM_VERIFIED': return CheckCircle2;
      case 'CONFLICT_DETECTED': return AlertTriangle;
      case 'AI_QUESTION': return MessageSquare;
      case 'STATUS_CHANGE': return Activity;
      default: return Activity;
    }
  };

  const Icon = getIcon(activity.type || activity.activityType);

  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900">{activity.message || activity.description}</p>
        <p className="text-xs text-slate-500">
          {formatDistanceToNow(new Date(activity.createdAt || activity.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

// Note item component
function NoteItem({ note }) {
  const typeConfig = NOTE_TYPE_CONFIG[note.noteType] || NOTE_TYPE_CONFIG.GENERAL;

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
        <span className="text-xs text-slate-500">
          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-slate-700">{note.content}</p>
      <p className="text-xs text-slate-500 mt-2">— {note.createdByName || 'Admin'}</p>
    </div>
  );
}

export default function AdminOnboardingDetail() {
  const navigate = useNavigate();
  const { sessionId } = useParams();

  // State
  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Note form state
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('GENERAL');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Update state
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch session details
  const fetchSession = useCallback(async (showRefreshIndicator = false) => {
    if (!sessionId) return;

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const response = await bff.onboarding.getSession(sessionId);
      const data = response.data;

      setSession(data.session || data);
      setCategories(data.categories || []);
      setActivities(data.activities || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch session:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load session');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sessionId]);

  // Fetch admin notes
  const fetchNotes = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await bff.get(`/api/admin/onboarding/${sessionId}/notes`);
      setNotes(response.data.notes || []);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      // Don't set error - notes are optional
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      navigate('/admin/onboarding');
      return;
    }
    fetchSession();
    fetchNotes();
  }, [sessionId, fetchSession, fetchNotes, navigate]);

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setIsAddingNote(true);
    try {
      await bff.post(`/api/admin/onboarding/${sessionId}/notes`, {
        content: newNote.trim(),
        noteType
      });
      setNewNote('');
      setNoteType('GENERAL');
      fetchNotes();
    } catch (err) {
      console.error('Failed to add note:', err);
      setError('Failed to add note. Please try again.');
    } finally {
      setIsAddingNote(false);
    }
  };

  // Update session (assignee, status)
  const handleUpdateSession = async (updates) => {
    setIsUpdating(true);
    try {
      await bff.patch(`/api/admin/onboarding/${sessionId}`, updates);
      fetchSession(true);
    } catch (err) {
      console.error('Failed to update session:', err);
      setError('Failed to update session. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Derived values
  const statusConfig = STATUS_CONFIG[session?.status] || STATUS_CONFIG.PROCESSING;
  const slaStatus = getSLAStatus(session?.slaDeadline);
  const SLAIcon = slaStatus.icon;
  const totalRecords = session?.totalRecords || 0;
  const processedRecords = session?.processedRecords || 0;
  const verifiedRecords = session?.verifiedRecords || 0;
  const progressPercent = totalRecords > 0 ? Math.round((processedRecords / totalRecords) * 100) : 0;
  const orgName = session?.organization?.name || session?.organizationName || 'Unknown Organization';

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Session not found
  if (!session && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-slate-500 mb-4">
              The onboarding session could not be found.
            </p>
            <Button onClick={() => navigate('/admin/onboarding')}>
              Back to Queue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/onboarding')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-slate-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">{orgName}</h1>
                  <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                  {session?.tier === 'WHITE_GLOVE' && (
                    <Badge className="bg-purple-100 text-purple-700">White Glove</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  Session ID: {sessionId}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* SLA Indicator */}
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${slaStatus.color}`}>
              <SLAIcon className="w-4 h-4" />
              <span className="text-sm font-medium">{slaStatus.label}</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchSession(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">Total Records</p>
              <p className="text-2xl font-bold text-slate-900">{totalRecords}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">Processed</p>
              <p className="text-2xl font-bold text-blue-600">{processedRecords}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">Verified</p>
              <p className="text-2xl font-bold text-green-600">{verifiedRecords}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{totalRecords - verifiedRecords}</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress Bar */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Overall Progress</span>
              <span className="text-sm text-slate-500">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="links">
              Links
              {session?._count?.dataLinks > 0 && (
                <Badge className="ml-1.5 bg-blue-100 text-blue-700 text-xs">
                  {session._count.dataLinks}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes">
              Notes
              {notes.length > 0 && (
                <Badge className="ml-1.5 bg-slate-100 text-slate-700 text-xs">
                  {notes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-2 gap-6">
              {/* Session Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Session Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <Select
                      value={session?.status}
                      onValueChange={(value) => handleUpdateSession({ status: value })}
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PROCESSING">Processing</SelectItem>
                        <SelectItem value="REVIEW">Customer Review</SelectItem>
                        <SelectItem value="TEAM_REVIEW">Team Review</SelectItem>
                        <SelectItem value="READY">Ready</SelectItem>
                        <SelectItem value="LIVE">Live</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Tier</span>
                    <span className="text-sm font-medium">{session?.tier || 'Self Service'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Created</span>
                    <span className="text-sm font-medium">
                      {session?.createdAt && format(new Date(session.createdAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">SLA Deadline</span>
                    <span className="text-sm font-medium">
                      {session?.slaDeadline && format(new Date(session.slaDeadline), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Assigned To</span>
                    <span className="text-sm font-medium">
                      {session?.assignedToName || 'Unassigned'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categories.length > 0 ? categories.map((cat) => {
                      const Icon = CATEGORY_ICONS[cat.name?.toLowerCase()] || FileText;
                      return (
                        <div key={cat.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-medium capitalize">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={cat.progress || 0} className="w-24 h-1.5" />
                            <span className="text-xs text-slate-500 w-12 text-right">
                              {cat.processed || 0}/{cat.total || 0}
                            </span>
                          </div>
                        </div>
                      );
                    }) : (
                      <p className="text-sm text-slate-500">No categories selected</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Records Tab */}
          <TabsContent value="records">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Records by Category</CardTitle>
                <CardDescription>
                  View and manage extracted records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categories.length > 0 ? categories.map((cat) => (
                    <div key={cat.name} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium capitalize">{cat.name}</h3>
                        <Badge>{cat.total || 0} records</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="text-green-600">{cat.verified || 0} verified</span>
                        <span className="text-amber-600">{(cat.total || 0) - (cat.verified || 0)} pending</span>
                      </div>
                      <Button
                        variant="link"
                        className="mt-2 p-0 h-auto"
                        onClick={() => navigate(`/onboarding/review?sessionId=${sessionId}&category=${cat.name}`)}
                      >
                        View Records →
                      </Button>
                    </div>
                  )) : (
                    <p className="text-center py-8 text-slate-500">No records to display</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Data Links</CardTitle>
                  <CardDescription>
                    Discovered relationships between records
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/onboarding/links?sessionId=${sessionId}`)}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  View All Links
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Link2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-500 mb-2">
                    {session?._count?.dataLinks || 0} data links discovered
                  </p>
                  <Button
                    variant="link"
                    onClick={() => navigate(`/onboarding/links?sessionId=${sessionId}`)}
                  >
                    Review and confirm links →
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin Notes</CardTitle>
                <CardDescription>
                  Internal notes and communications about this import
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add Note Form */}
                <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <Select value={noteType} onValueChange={setNoteType}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GENERAL">General</SelectItem>
                        <SelectItem value="ESCALATION">Escalation</SelectItem>
                        <SelectItem value="SLA">SLA</SelectItem>
                        <SelectItem value="QUALITY">Quality</SelectItem>
                        <SelectItem value="QUESTION">Question</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || isAddingNote}
                    >
                      {isAddingNote ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Add Note
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Notes List */}
                <div className="space-y-3">
                  {notes.length > 0 ? notes.map((note) => (
                    <NoteItem key={note.id} note={note} />
                  )) : (
                    <p className="text-center py-8 text-slate-500">No notes yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity Timeline</CardTitle>
                <CardDescription>
                  Recent events and changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activities.length > 0 ? (
                  <div className="space-y-0">
                    {activities.map((activity, index) => (
                      <ActivityItem key={activity.id || index} activity={activity} />
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-slate-500">No activity recorded</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
