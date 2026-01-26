/**
 * GP Counsel Home - Kanban Dashboard
 *
 * Main dashboard for GP Counsel showing:
 * - Kanban board with NEW, IN_PROGRESS, COMPLETE columns
 * - Auto-aging colors (green/yellow/red) based on deadlines
 * - My assigned matters
 * - Urgent/overdue matters
 * - Recent activity feed
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scale,
  Plus,
  Clock,
  AlertTriangle,
  Activity,
  User,
  Building2,
  ChevronRight,
  RefreshCw,
  Filter
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { bff } from '../../api/bffClient';
import LegalKanbanBoard from '../../components/legal/LegalKanbanBoard';
import LegalMatterCard from '../../components/legal/LegalMatterCard';
import ApprovalQueueWidget from '../../components/legal/ApprovalQueueWidget';

export default function GPCounselHome() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const data = await bff.legal.getDashboard();
      setDashboard(data);
      setError(null);
    } catch (err) {
      console.error('[GPCounselHome] Failed to load dashboard:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleMatterClick = (matterId) => {
    navigate(`/LegalMatterDetail/${matterId}`);
  };

  const handleNewMatter = () => {
    navigate('/LegalMatterCreate');
  };

  const handleStageChange = async (matterId, newStage) => {
    try {
      await bff.legal.changeMatterStage(matterId, newStage);
      // Reload dashboard to reflect changes
      loadDashboard(true);
    } catch (err) {
      console.error('[GPCounselHome] Failed to change stage:', err);
      setError(err.message || 'Failed to update matter');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading dashboard</h3>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={() => loadDashboard()}
            className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { counts, columns, urgentMatters, myMatters, recentActivity } = dashboard || {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Legal Dashboard</h1>
            <p className="text-gray-500 text-sm">
              Welcome back, {user?.name || user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleNewMatter}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Matter
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4" data-testid="stats-bar">
        <StatCard
          label="New"
          count={counts?.NEW || 0}
          color="blue"
          onClick={() => navigate('/LegalMatters?stage=NEW')}
        />
        <StatCard
          label="In Progress"
          count={counts?.IN_PROGRESS || 0}
          color="yellow"
          onClick={() => navigate('/LegalMatters?stage=IN_PROGRESS')}
        />
        <StatCard
          label="Complete"
          count={counts?.COMPLETE || 0}
          color="green"
          onClick={() => navigate('/LegalMatters?stage=COMPLETE')}
        />
        <StatCard
          label="Total Matters"
          count={counts?.total || 0}
          color="gray"
          onClick={() => navigate('/LegalMatters')}
        />
      </div>

      {/* Kanban Board */}
      <LegalKanbanBoard
        columns={columns}
        onMatterClick={handleMatterClick}
        onStageChange={handleStageChange}
      />

      {/* Bottom Section: Urgent + My Matters + Activity */}
      <div className="grid grid-cols-3 gap-6">
        {/* Urgent Matters */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-4 border-b flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="font-semibold text-gray-900">Urgent Matters</h3>
          </div>
          <div className="p-4 space-y-3">
            {urgentMatters?.length > 0 ? (
              urgentMatters.map(matter => (
                <UrgentMatterRow
                  key={matter.id}
                  matter={matter}
                  onClick={() => handleMatterClick(matter.id)}
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">
                No urgent matters
              </p>
            )}
          </div>
        </div>

        {/* My Matters */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-4 border-b flex items-center gap-2">
            <User className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900">My Matters</h3>
          </div>
          <div className="p-4 space-y-3">
            {myMatters?.length > 0 ? (
              myMatters.map(matter => (
                <MyMatterRow
                  key={matter.id}
                  matter={matter}
                  onClick={() => handleMatterClick(matter.id)}
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">
                No matters assigned to you
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-4 border-b flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold text-gray-900">Recent Activity</h3>
          </div>
          <div className="p-4 space-y-3">
            {recentActivity?.length > 0 ? (
              recentActivity.map(activity => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  onClick={() => handleMatterClick(activity.matter?.id)}
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">
                No recent activity
              </p>
            )}
          </div>
        </div>
      </div>

      {/* GC-Only Widgets */}
      {user?.role === 'General Counsel' && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">General Counsel Oversight</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ApprovalQueueWidget onViewAll={() => navigate('/GCApprovalQueue')} />
            {/* Future widgets: TeamWorkloadWidget, OutsideCounselSpendWidget */}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && dashboard && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ========== Sub-components ==========

function StatCard({ label, count, color, onClick }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700'
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border transition-all hover:shadow-md ${colorClasses[color]}`}
    >
      <div className="text-3xl font-bold">{count}</div>
      <div className="text-sm font-medium">{label}</div>
    </button>
  );
}

function UrgentMatterRow({ matter, onClick }) {
  const daysUntilDue = matter.dueDate
    ? Math.ceil((new Date(matter.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">{matter.title}</div>
          {matter.dealName && (
            <div className="text-sm text-gray-500 flex items-center gap-1 mt-1">
              <Building2 className="h-3 w-3" />
              {matter.dealName}
            </div>
          )}
        </div>
        <div className={`text-xs font-medium px-2 py-1 rounded ${
          daysUntilDue < 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
        }`}>
          {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : `${daysUntilDue}d left`}
        </div>
      </div>
    </button>
  );
}

function MyMatterRow({ matter, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">{matter.title}</div>
          <div className="text-sm text-gray-500">{matter.matterNumber}</div>
        </div>
        <div className="flex items-center gap-2">
          <AgingBadge color={matter.agingColor} />
          <StageBadge stage={matter.stage} />
        </div>
      </div>
    </button>
  );
}

function ActivityRow({ activity, onClick }) {
  const activityIcons = {
    COMMENT: '💬',
    STATUS_CHANGE: '🔄',
    ASSIGNMENT: '👤',
    SIGN_OFF: '✅',
    PRIORITY_CHANGE: '⚡',
    AI_ANALYSIS: '🤖'
  };

  const timeAgo = formatTimeAgo(activity.createdAt);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-200"
    >
      <div className="flex items-start gap-2">
        <span className="text-lg">{activityIcons[activity.activityType] || '📝'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-900">
            <span className="font-medium">{activity.createdByName}</span>
            {' '}
            {activity.activityType === 'COMMENT' ? 'commented' :
             activity.activityType === 'STATUS_CHANGE' ? 'changed status' :
             activity.activityType === 'ASSIGNMENT' ? 'assigned' :
             activity.activityType === 'SIGN_OFF' ? 'signed off' :
             'updated'}
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {activity.matter?.title || 'Unknown matter'}
          </div>
          <div className="text-xs text-gray-400 mt-1">{timeAgo}</div>
        </div>
      </div>
    </button>
  );
}

function AgingBadge({ color }) {
  if (!color) return null;

  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  };

  return (
    <span
      className={`w-2 h-2 rounded-full ${colors[color]}`}
      title={color === 'red' ? 'Urgent' : color === 'yellow' ? 'Soon' : 'On Track'}
    />
  );
}

function StageBadge({ stage }) {
  const stageStyles = {
    NEW: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
    COMPLETE: 'bg-green-100 text-green-700'
  };

  const stageLabels = {
    NEW: 'New',
    IN_PROGRESS: 'In Progress',
    COMPLETE: 'Complete'
  };

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${stageStyles[stage]}`}>
      {stageLabels[stage]}
    </span>
  );
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
