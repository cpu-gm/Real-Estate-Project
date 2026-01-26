import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useRole } from '../Layout';
import { useAuth } from '@/lib/AuthContext';
import { isGPCounselRole } from '@/lib/permissions';
import { bff } from '@/api/bffClient';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Plus,
  Calculator,
  Send,
  Briefcase,
  BarChart3,
  Shield,
  Check,
  FileText,
  Upload,
  Folder,
  Newspaper,
  ExternalLink,
  MessageSquare,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Building2,
  Scale,
  Mail,
  FileCheck,
  Eye,
  Hourglass
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ActivityFeed from '@/components/ActivityFeed';
import InvitationAlertCard from '@/components/broker/InvitationAlertCard';
import CommandCenter from '@/components/dashboard/CommandCenter';
import DeadlineWidget from '@/components/dashboard/DeadlineWidget';
import OverdueBanner, { useOverdueItems } from '@/components/dashboard/OverdueBanner';

// Icon mapping for quick starts
const iconMap = {
  plus: Plus,
  calculator: Calculator,
  send: Send,
  briefcase: Briefcase,
  chart: BarChart3,
  shield: Shield,
  check: Check,
  file: FileText,
  upload: Upload,
  folder: Folder
};

// Status colors for decision cards
const statusColors = {
  urgent: {
    bg: 'bg-trust-risk/10',
    border: 'border-trust-risk/20',
    icon: 'text-trust-risk',
    badge: 'bg-trust-risk/15 text-trust-risk'
  },
  warning: {
    bg: 'bg-trust-pending/10',
    border: 'border-trust-pending/20',
    icon: 'text-trust-pending',
    badge: 'bg-trust-pending/15 text-trust-pending'
  },
  ready: {
    bg: 'bg-trust-verified/10',
    border: 'border-trust-verified/20',
    icon: 'text-trust-verified',
    badge: 'bg-trust-verified/15 text-trust-verified'
  }
};

// Impact icons for news
const impactIcons = {
  positive: { icon: TrendingUp, color: 'text-trust-verified' },
  negative: { icon: TrendingDown, color: 'text-trust-risk' },
  neutral: { icon: Minus, color: 'text-muted-foreground' }
};

function DecisionCard({ card }) {
  const colors = statusColors[card.status] || statusColors.ready;
  const StatusIcon = card.status === 'urgent' ? AlertTriangle :
                     card.status === 'warning' ? AlertCircle : CheckCircle2;

  return (
    <Link
      to={createPageUrl(`DealOverview?id=${card.dealId}`)}
      className={cn(
        "block p-ds-16 rounded-lg border transition-colors duration-150 hover:shadow-sm",
        colors.bg,
        colors.border
      )}
    >
      <div className="flex items-start gap-ds-12">
        <StatusIcon className={cn("w-5 h-5 mt-0.5 flex-shrink-0", colors.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-ds-8 mb-ds-4">
            <h3 className="text-ds-section font-medium text-foreground truncate">{card.dealName}</h3>
            <Badge className={cn("text-ds-micro", colors.badge)}>
              {card.status === 'urgent' ? 'Blocked' :
               card.status === 'warning' ? 'Attention' : 'Ready'}
            </Badge>
          </div>
          <p className="text-ds-body text-muted-foreground mb-ds-8 line-clamp-2">{card.summary}</p>
          {card.consequence && (
            <p className="text-ds-micro text-muted-foreground mb-3">{card.consequence}</p>
          )}
          <div className="flex items-center gap-ds-8 flex-wrap">
            <Button size="sm" className="h-7">
              {card.primaryAction?.label || 'Review'}
            </Button>
            {card.secondaryActions?.map((action, i) => (
              <Button key={i} size="sm" variant="outline" className="h-7">
                {action.label}
              </Button>
            ))}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}

function ChangeFeedItem({ change }) {
  const severityIcon = {
    critical: { icon: AlertTriangle, color: 'text-trust-risk' },
    warning: { icon: AlertCircle, color: 'text-trust-pending' },
    info: { icon: CheckCircle2, color: 'text-trust-verified' }
  };

  const { icon: Icon, color } = severityIcon[change.severity] || severityIcon.info;
  const timeAgo = formatTimeAgo(change.timestamp);

  return (
    <div className="flex items-start gap-ds-12 py-ds-8">
      <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", color)} />
      <div className="flex-1 min-w-0">
        <p className="text-ds-body text-foreground">
          <Link
            to={createPageUrl(`DealOverview?id=${change.dealId}`)}
            className="font-medium hover:underline"
          >
            {change.dealName}
          </Link>
          {' — '}{change.summary}
        </p>
        <p className="text-ds-micro text-muted-foreground">{timeAgo}</p>
      </div>
    </div>
  );
}

function QuickStartButton({ item, href }) {
  const Icon = iconMap[item.icon] || Plus;

  return (
    <Link
      to={href || '#'}
      className="flex items-center gap-ds-12 p-ds-12 rounded-md border border-border bg-card hover:border-ink-900 hover:shadow-sm transition-colors duration-150"
    >
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ds-body font-medium text-foreground">{item.label}</p>
        {item.description && (
          <p className="text-ds-micro text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  );
}

function TruthBar({ truthBar, prominent = false }) {
  if (!truthBar) return null;

  const items = [
    { label: 'stale data', count: truthBar.staleDataCount, color: 'text-trust-pending', icon: Clock },
    { label: 'overrides', count: truthBar.unresolvedOverrides, color: 'text-trust-pending', icon: AlertCircle },
    { label: 'disputed', count: truthBar.disputedDocuments, color: 'text-trust-risk', icon: AlertTriangle }
  ];

  const totalIssues = items.reduce((sum, item) => sum + (item.count || 0), 0);
  const hasIssues = totalIssues > 0;

  // Prominent version for top of page
  if (prominent) {
    if (!hasIssues) {
      return (
        <div className="flex items-center gap-ds-12 px-ds-16 py-ds-12 bg-trust-verified/10 border border-trust-verified/20 rounded-lg mb-ds-24">
          <CheckCircle2 className="w-5 h-5 text-trust-verified" />
          <div className="flex-1">
            <span className="text-ds-body font-medium text-trust-verified">Data Quality: All Clear</span>
            <span className="text-ds-micro text-trust-verified ml-2">No stale data, overrides, or disputes</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-ds-16 px-ds-16 py-ds-12 bg-trust-pending/10 border border-trust-pending/20 rounded-lg mb-ds-24">
        <AlertTriangle className="w-5 h-5 text-trust-pending flex-shrink-0" />
        <div className="flex-1">
          <span className="text-ds-body font-medium text-trust-pending">Data Quality Issues ({totalIssues})</span>
          <div className="flex items-center gap-ds-16 mt-ds-4">
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <span key={i} className={cn(
                  "flex items-center gap-ds-4 text-ds-micro font-medium",
                  item.count > 0 ? item.color : "text-muted-foreground"
                )}>
                  <Icon className="w-3 h-3" />
                  {item.count} {item.label}
                </span>
              );
            })}
          </div>
        </div>
        <Link
          to={createPageUrl('Deals')}
          className="px-ds-12 py-ds-8 text-ds-micro font-medium text-trust-pending bg-trust-pending/15 hover:bg-trust-pending/20 rounded-md transition-colors"
        >
          Review Issues
        </Link>
      </div>
    );
  }

  // Compact footer version (legacy)
  return (
    <div className="flex items-center gap-ds-16 px-ds-16 py-ds-8 bg-slate-100 border-t border-border text-ds-micro">
      <span className="text-muted-foreground font-medium">TRUTH BAR:</span>
      {items.map((item, i) => (
        <span key={i} className={cn("font-medium", item.count > 0 ? item.color : "text-muted-foreground")}>
          {item.count} {item.label}
        </span>
      ))}
    </div>
  );
}

function NewsInsightCard({ insight, onAsk, onDismiss, isAsking }) {
  const [question, setQuestion] = useState('');
  const [showAskInput, setShowAskInput] = useState(false);
  const [answer, setAnswer] = useState(null);

  const { icon: ImpactIcon, color: impactColor } = impactIcons[insight.impact] || impactIcons.neutral;
  const timeAgo = formatTimeAgo(insight.publishedAt);

  const handleAsk = async () => {
    if (!question.trim()) return;
    const result = await onAsk(insight.id, question);
    if (result?.answer) {
      setAnswer(result);
      setQuestion('');
      setShowAskInput(false);
    }
  };

  return (
    <div className="p-ds-16 rounded-lg border border-border bg-card hover:border-slate-200 transition-colors">
      <div className="flex items-start gap-ds-12">
        <Newspaper className="w-5 h-5 text-trust-ai mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-ds-8 mb-ds-8">
            <h3 className="text-ds-section font-medium text-foreground">{insight.headline}</h3>
            <button
              onClick={() => onDismiss(insight.id)}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <p className="text-ds-body text-muted-foreground mb-ds-8">{insight.summary}</p>

          {insight.roleSpecificInsight && (
            <div className="bg-trust-ai/10 rounded-md p-ds-12 mb-ds-12">
              <p className="text-ds-body text-trust-ai">{insight.roleSpecificInsight}</p>
            </div>
          )}

          {answer && (
            <div className="bg-trust-kernel/10 rounded-md p-ds-12 mb-ds-12 border border-trust-kernel/20">
              <p className="text-ds-body text-trust-kernel mb-ds-8">{answer.answer}</p>
              {answer.sources?.length > 0 && (
                <div className="flex flex-wrap gap-ds-4">
                  {answer.sources.map((s, i) => (
                    <span key={i} className="text-ds-micro text-trust-kernel bg-trust-kernel/15 px-ds-8 py-ds-4 rounded-sm">
                      {s.reference}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-ds-12 text-ds-micro text-muted-foreground">
            <div className="flex items-center gap-ds-4">
              <ImpactIcon className={cn("w-3 h-3", impactColor)} />
              <span className="capitalize">{insight.impact}</span>
            </div>
            <span>•</span>
            <a
              href={insight.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-ds-4 hover:text-foreground"
            >
              {insight.source}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span>•</span>
            <span>{timeAgo}</span>
          </div>

          <div className="flex items-center gap-ds-8 mt-ds-12">
            {showAskInput ? (
              <div className="flex-1 flex gap-ds-8">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a follow-up question..."
                  className="h-8"
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={handleAsk}
                  disabled={isAsking || !question.trim()}
                >
                  {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => setShowAskInput(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setShowAskInput(true)}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Tell me more
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return then.toLocaleDateString();
}

// =============================================================================
// LENDER HOME COMPONENT
// "Risk-aware exposure console"
// =============================================================================

function LenderHome({ homeData, newsData, handleAsk, handleDismiss, askMutation, newsLoading }) {
  const { currentRole } = useRole();

  // Mock data for demo - in production this comes from homeData
  const exposure = homeData?.exposure || { dealCount: 3, totalOutstanding: 127500000 };
  const riskBuckets = homeData?.riskBuckets || { needsAttention: 1, monitoring: 1, stable: 1 };
  const dealList = homeData?.dealList || [];
  const riskSignals = homeData?.riskSignals || [];
  const actionsRequired = homeData?.actionsRequired || [];
  const changeFeed = homeData?.changeFeed || [];
  const insights = newsData?.insights || [];

  const formatCurrency = (value) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Exposure Summary */}
      <div className="bg-card border-b border-border">
        <div className="max-w-content mx-auto px-ds-24 py-ds-24">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-ds-8 mb-ds-4">
                <Building2 className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Bank X — Credit Team</span>
              </div>
              <h1 className="text-ds-screen font-semibold text-foreground">
                Active Exposure: {exposure.dealCount} Deals · {formatCurrency(exposure.totalOutstanding)}
              </h1>
            </div>
            <Badge variant="outline" className="text-ds-micro">
              {currentRole}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-content mx-auto px-ds-24 py-ds-24 space-y-ds-32">

        {/* Risk Snapshot - Three Buckets */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Risk Snapshot
          </h2>
          <div className="grid grid-cols-3 gap-ds-16">
            <div className={cn(
              "bg-card rounded-lg border p-6 text-center",
              riskBuckets.needsAttention > 0 ? "border-trust-risk/20 bg-trust-risk/10" : "border-border"
            )}>
              <p className="text-ds-hero font-bold text-foreground">{riskBuckets.needsAttention}</p>
              <p className={cn(
                "text-sm font-medium mt-ds-4",
                riskBuckets.needsAttention > 0 ? "text-trust-risk" : "text-muted-foreground"
              )}>Needs Attention</p>
            </div>
            <div className={cn(
              "bg-card rounded-lg border p-6 text-center",
              riskBuckets.monitoring > 0 ? "border-trust-pending/20 bg-trust-pending/10" : "border-border"
            )}>
              <p className="text-ds-hero font-bold text-foreground">{riskBuckets.monitoring}</p>
              <p className={cn(
                "text-sm font-medium mt-ds-4",
                riskBuckets.monitoring > 0 ? "text-trust-pending" : "text-muted-foreground"
              )}>Monitoring</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-6 text-center">
              <p className="text-ds-hero font-bold text-foreground">{riskBuckets.stable}</p>
              <p className="text-sm font-medium text-trust-verified mt-ds-4">Stable</p>
            </div>
          </div>
        </section>

        {/* Deal List Table */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Deal Portfolio
          </h2>
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left text-ds-micro font-semibold text-muted-foreground uppercase tracking-wider px-ds-16 py-ds-12">Deal</th>
                  <th className="text-left text-ds-micro font-semibold text-muted-foreground uppercase tracking-wider px-ds-16 py-ds-12">Sponsor</th>
                  <th className="text-right text-ds-micro font-semibold text-muted-foreground uppercase tracking-wider px-ds-16 py-ds-12">Exposure</th>
                  <th className="text-center text-ds-micro font-semibold text-muted-foreground uppercase tracking-wider px-ds-16 py-ds-12">DSCR</th>
                  <th className="text-left text-ds-micro font-semibold text-muted-foreground uppercase tracking-wider px-ds-16 py-ds-12">Last Update</th>
                  <th className="text-left text-ds-micro font-semibold text-muted-foreground uppercase tracking-wider px-ds-16 py-ds-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dealList.length > 0 ? dealList.map((deal) => (
                  <tr key={deal.dealId} className="hover:bg-background">
                    <td className="px-ds-16 py-ds-12">
                      <Link to={createPageUrl(`DealOverview?id=${deal.dealId}`)} className="font-medium text-foreground hover:underline">
                        {deal.dealName}
                      </Link>
                    </td>
                    <td className="px-ds-16 py-ds-12 text-sm text-muted-foreground">{deal.sponsor}</td>
                    <td className="px-ds-16 py-ds-12 text-sm text-foreground text-right font-medium">{formatCurrency(deal.exposure)}</td>
                    <td className="px-ds-16 py-ds-12 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-ds-4 text-sm font-medium",
                        deal.dscrStatus === 'warning' ? "text-trust-pending" :
                        deal.dscrStatus === 'danger' ? "text-trust-risk" : "text-trust-verified"
                      )}>
                        {deal.dscrStatus === 'warning' && <AlertCircle className="w-3 h-3" />}
                        {deal.dscrStatus === 'danger' && <AlertTriangle className="w-3 h-3" />}
                        {deal.dscrStatus === 'healthy' && <CheckCircle2 className="w-3 h-3" />}
                        {deal.dscr?.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-ds-16 py-ds-12 text-sm text-muted-foreground">{deal.lastUpdate}</td>
                    <td className="px-ds-16 py-ds-12">
                      {deal.actionRequired ? (
                        <Button size="sm" variant="outline" className="h-7 text-ds-micro">
                          {deal.actionRequired.label}
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-ds-16 py-ds-32 text-center text-sm text-muted-foreground">
                      No deals in portfolio
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Two Column: Changes + Actions Required */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* What Changed */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Since Your Last Review
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-16">
              {changeFeed.length > 0 ? (
                <div className="divide-y divide-border">
                  {changeFeed.slice(0, 5).map((change) => (
                    <ChangeFeedItem key={change.id} change={change} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-ds-12 p-ds-16 bg-trust-kernel/10 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-trust-kernel flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-trust-kernel">No recent changes</p>
                    <p className="text-ds-micro text-trust-kernel">Your deals have been stable since your last review</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Decisions Required */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Your Decisions Required
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-16">
              {actionsRequired.length > 0 ? (
                <div className="space-y-3">
                  {actionsRequired.map((action, idx) => (
                    <div key={idx} className="flex items-center justify-between p-ds-12 bg-background rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{action.dealName}</p>
                        <p className="text-ds-micro text-muted-foreground">{action.summary}</p>
                      </div>
                      <Button size="sm" className="h-7 text-ds-micro">
                        {action.actionLabel || 'Review'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-ds-12 p-ds-16 bg-trust-verified/10 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-trust-verified flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-trust-verified">All caught up!</p>
                    <p className="text-ds-micro text-trust-verified">No pending decisions - your portfolio is in good standing</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Portfolio Risk Signals */}
        {riskSignals.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Portfolio Risk Signals
            </h2>
            <div className="bg-trust-pending/10 border border-trust-pending/20 rounded-lg p-ds-16">
              <ul className="space-y-2">
                {riskSignals.map((signal, idx) => (
                  <li key={idx} className="flex items-start gap-ds-8 text-sm text-trust-pending">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-trust-pending" />
                    {signal.message}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Recent Activity */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          <div className="bg-card rounded-lg border border-border p-ds-8">
            <ActivityFeed
              limit={6}
              onActivityClick={(activity) => {
                if (activity.dealId) {
                  window.location.href = createPageUrl(`DealOverview?id=${activity.dealId}`);
                }
              }}
            />
          </div>
        </section>

        {/* AI News & Insights (Credit Risk Focus) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              AI News & Insights — Credit Risk Focus
            </h2>
            {newsData?._mock && (
              <Badge variant="outline" className="text-ds-micro text-trust-ai border-trust-ai/20">
                Demo Data
              </Badge>
            )}
          </div>

          {newsLoading ? (
            <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />
          ) : insights.length > 0 ? (
            <div className="grid grid-cols-1 gap-ds-16">
              {insights.slice(0, 2).map((insight) => (
                <NewsInsightCard
                  key={insight.id}
                  insight={insight}
                  onAsk={handleAsk}
                  onDismiss={handleDismiss}
                  isAsking={askMutation?.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <Newspaper className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm font-medium text-muted-foreground">No news insights yet</p>
              <p className="text-ds-micro text-muted-foreground mt-ds-4">We'll surface relevant market news as it becomes available</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// COUNSEL HOME COMPONENT
// "Work obligation dashboard"
// =============================================================================

function CounselHome({ homeData, newsData, handleAsk, handleDismiss, askMutation, newsLoading }) {
  const { currentRole } = useRole();

  // Mock data for demo
  const firmName = homeData?.firmName || "Smith & Carter LLP";
  const openRequests = homeData?.openRequests || [];
  const inProgress = homeData?.inProgress || [];
  const teamActivity = homeData?.teamActivity || [];
  const emailStatus = homeData?.emailStatus || [];
  const allClear = homeData?.allClear ?? (openRequests.length === 0);

  const requestStatusColors = {
    draft_requested: { bg: 'bg-trust-kernel/10', border: 'border-trust-kernel/20', text: 'text-trust-kernel', label: 'Draft Requested' },
    clarification_requested: { bg: 'bg-trust-pending/10', border: 'border-trust-pending/20', text: 'text-trust-pending', label: 'Clarification Needed' },
    review_pending: { bg: 'bg-trust-ai/10', border: 'border-trust-ai/20', text: 'text-trust-ai', label: 'Review Pending' },
    urgent: { bg: 'bg-trust-risk/10', border: 'border-trust-risk/20', text: 'text-trust-risk', label: 'Urgent' }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Firm & Role Framing */}
      <div className="bg-card border-b border-border">
        <div className="max-w-content mx-auto px-ds-24 py-ds-24">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-ds-8 mb-ds-4">
                <Scale className="w-5 h-5 text-muted-foreground" />
                <span className="text-ds-panel font-semibold text-foreground">{firmName}</span>
                <span className="text-sm text-muted-foreground">— External Counsel Workspace</span>
              </div>
              <p className="text-sm text-muted-foreground italic">
                "You are participating as external legal counsel. Drafting and commentary only. No approval authority."
              </p>
            </div>
            <Badge variant="outline" className="text-ds-micro">
              {currentRole}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-content mx-auto px-ds-24 py-ds-24 space-y-ds-32">

        {/* All Clear State */}
        {allClear && (
          <section className="bg-trust-verified/10 border border-trust-verified/20 rounded-lg p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-trust-verified mx-auto mb-3" />
            <h2 className="text-ds-panel font-semibold text-trust-verified">No open requests.</h2>
            <p className="text-sm text-trust-verified mt-ds-4">We'll notify you if further input is needed.</p>
          </section>
        )}

        {/* Requests Requiring Attention */}
        {!allClear && openRequests.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Requests Requiring Attention
            </h2>
            <div className="space-y-4">
              {openRequests.map((req) => {
                const statusStyle = requestStatusColors[req.status] || requestStatusColors.review_pending;
                return (
                  <div key={req.id} className={cn("rounded-lg border p-ds-24", statusStyle.bg, statusStyle.border)}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {req.dealName} — {req.matterType}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Requested by: {req.requestedBy} · <span className={cn("font-medium", statusStyle.text)}>{statusStyle.label}</span>
                          {req.dueDate && <span className="ml-2">· Due: {req.dueDate}</span>}
                        </p>
                      </div>
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-ink-700 mb-4">{req.summary}</p>
                    <div className="flex items-center gap-ds-8 flex-wrap">
                      <Button size="sm" className="h-8 text-ds-micro">
                        <Eye className="w-3 h-3 mr-1" />
                        Review documents
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-ds-micro">
                        <Upload className="w-3 h-3 mr-1" />
                        Upload draft
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-ds-micro">
                        <Mail className="w-3 h-3 mr-1" />
                        Email instead
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Two Column: In Progress + Team Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* In Progress / Waiting */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              In Progress / Awaiting Response
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-16">
              {inProgress.length > 0 ? (
                <div className="space-y-3">
                  {inProgress.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-ds-12 py-ds-8">
                      <Hourglass className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{item.dealName}</span> — {item.summary}
                        </p>
                        <p className="text-ds-micro text-muted-foreground">
                          Awaiting: {item.waitingOn}
                          {item.lastTouched && (
                            <span> · Last: {item.lastTouched.user}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nothing in progress
                </p>
              )}
            </div>
          </section>

          {/* Recent Activity */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Recent Activity
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-8">
              <ActivityFeed
                limit={6}
                onActivityClick={(activity) => {
                  if (activity.dealId) {
                    window.location.href = createPageUrl(`DealOverview?id=${activity.dealId}`);
                  }
                }}
              />
            </div>
          </section>
        </div>

        {/* Documents Sent by Email */}
        {emailStatus.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Documents Sent by Email
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-16">
              <div className="space-y-3">
                {emailStatus.map((email, idx) => (
                  <div key={idx} className="flex items-center justify-between py-ds-8">
                    <div className="flex items-center gap-ds-12">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-foreground">"{email.subject}"</p>
                        <p className="text-ds-micro text-muted-foreground">{email.deal} · {email.receivedAt}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-ds-micro",
                      email.status === 'confirmed' ? "text-trust-verified border-trust-verified/20" : "text-trust-pending border-trust-pending/20"
                    )}>
                      {email.status === 'confirmed' ? 'Confirmed' : 'Pending Confirmation'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* AI News (Legal Focus) - Optional, minimal */}
        {newsData?.insights?.length > 0 && !newsLoading && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Regulatory & Legal Updates
              </h2>
              {newsData?._mock && (
                <Badge variant="outline" className="text-ds-micro text-trust-ai border-trust-ai/20">
                  Demo Data
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 gap-ds-16">
              {newsData.insights.slice(0, 1).map((insight) => (
                <NewsInsightCard
                  key={insight.id}
                  insight={insight}
                  onAsk={handleAsk}
                  onDismiss={handleDismiss}
                  isAsking={askMutation?.isPending}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// GP ANALYST HOME COMPONENT
// "Task-focused analyst dashboard - assigned deals only"
// =============================================================================

function GPAnalystHome({ homeData, newsData, handleAsk, handleDismiss, askMutation, newsLoading }) {
  const { currentRole } = useRole();

  // GP Analyst sees only assigned deals
  const assignedDeals = homeData?.assignedDeals || [];
  const myTasks = homeData?.myTasks || [];
  const dataQualityIssues = homeData?.dataQualityIssues || [];
  const pendingReviews = homeData?.pendingReviews || [];

  const greeting = homeData?.greeting || `Good ${getTimeOfDay()}`;

  const taskStatusColors = {
    OPEN: { bg: 'bg-trust-kernel/10', text: 'text-trust-kernel', label: 'Open' },
    IN_PROGRESS: { bg: 'bg-trust-pending/10', text: 'text-trust-pending', label: 'In Progress' },
    DONE: { bg: 'bg-trust-verified/10', text: 'text-trust-verified', label: 'Done' },
    BLOCKED: { bg: 'bg-trust-risk/10', text: 'text-trust-risk', label: 'Blocked' }
  };

  const priorityColors = {
    LOW: 'text-muted-foreground',
    MEDIUM: 'text-trust-kernel',
    HIGH: 'text-trust-pending',
    URGENT: 'text-trust-risk'
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Analyst Dashboard */}
      <div className="bg-card border-b border-border">
        <div className="max-w-content mx-auto px-ds-24 py-ds-24">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-ds-screen font-semibold text-foreground">{greeting}</h1>
              <p className="text-sm text-muted-foreground mt-ds-4">
                Analyst Dashboard — {assignedDeals.length} assigned {assignedDeals.length === 1 ? 'deal' : 'deals'}
              </p>
            </div>
            <Badge variant="outline" className="text-ds-micro bg-teal-50 text-teal-700 border-teal-200">
              {currentRole}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-content mx-auto px-ds-24 py-ds-24 space-y-ds-32">

        {/* Empty State: No Assigned Deals */}
        {assignedDeals.length === 0 && (
          <section className="bg-background border border-slate-200 rounded-lg p-8 text-center">
            <Briefcase className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h2 className="text-ds-panel font-semibold text-ink-700">No deals assigned yet</h2>
            <p className="text-sm text-muted-foreground mt-ds-4">
              A GP will assign you to deals when there's work to be done.
            </p>
          </section>
        )}

        {/* My Assigned Tasks */}
        {myTasks.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              My Tasks
            </h2>
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="divide-y divide-border">
                {myTasks.slice(0, 8).map((task) => {
                  const statusStyle = taskStatusColors[task.status] || taskStatusColors.OPEN;
                  return (
                    <div key={task.id} className="p-ds-16 hover:bg-background transition-colors">
                      <div className="flex items-start gap-ds-12">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-ds-8 flex-shrink-0",
                          priorityColors[task.priority]?.replace('text-', 'bg-') || 'bg-slate-400'
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-ds-8 mb-ds-4">
                            <h3 className="font-medium text-foreground truncate">{task.title}</h3>
                            <Badge className={cn("text-ds-micro", statusStyle.bg, statusStyle.text)}>
                              {statusStyle.label}
                            </Badge>
                          </div>
                          {task.dealName && (
                            <Link
                              to={createPageUrl(`DealOverview?id=${task.dealId}`)}
                              className="text-sm text-trust-kernel hover:underline"
                            >
                              {task.dealName}
                            </Link>
                          )}
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-ds-4 line-clamp-2">{task.description}</p>
                          )}
                          {task.dueDate && (
                            <p className="text-ds-micro text-muted-foreground mt-ds-8 flex items-center gap-ds-4">
                              <Clock className="w-3 h-3" />
                              Due: {new Date(task.dueDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Deals I'm Working On */}
        {assignedDeals.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Deals I'm Working On
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-ds-16">
              {assignedDeals.map((deal) => (
                <Link
                  key={deal.id}
                  to={createPageUrl(`DealOverview?id=${deal.id}`)}
                  className="block p-ds-24 bg-card rounded-lg border border-border hover:border-ink-500 hover:shadow-sm transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{deal.name}</h3>
                      <p className="text-sm text-muted-foreground">{deal.propertyType || 'Real Estate'}</p>
                    </div>
                    <Badge variant="outline" className="text-ds-micro">
                      {deal.phase || 'Active'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-ds-16 text-ds-micro text-muted-foreground">
                    {deal.openTasks > 0 && (
                      <span className="flex items-center gap-ds-4">
                        <FileCheck className="w-3 h-3" />
                        {deal.openTasks} open tasks
                      </span>
                    )}
                    {deal.dataIssues > 0 && (
                      <span className="flex items-center gap-ds-4 text-trust-pending">
                        <AlertCircle className="w-3 h-3" />
                        {deal.dataIssues} data issues
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Two Column: Data Quality + Pending Reviews */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Data Quality Issues */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Data Quality Issues
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-16">
              {dataQualityIssues.length > 0 ? (
                <div className="space-y-3">
                  {dataQualityIssues.slice(0, 5).map((issue, idx) => (
                    <div key={idx} className="flex items-start gap-ds-12 p-ds-12 bg-trust-pending/10 rounded-lg border border-trust-pending/20">
                      <AlertTriangle className="w-4 h-4 text-trust-pending mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{issue.fieldName}</p>
                        <p className="text-ds-micro text-muted-foreground">{issue.dealName} — {issue.reason}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-ds-micro">
                        Fix
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-ds-12 p-ds-16 bg-trust-verified/10 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-trust-verified" />
                  <p className="text-sm text-trust-verified">All data fields are up to date</p>
                </div>
              )}
            </div>
          </section>

          {/* Pending Reviews from GP */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Awaiting GP Review
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-16">
              {pendingReviews.length > 0 ? (
                <div className="space-y-3">
                  {pendingReviews.map((review, idx) => (
                    <div key={idx} className="flex items-center justify-between p-ds-12 bg-background rounded-lg">
                      <div className="flex items-center gap-ds-12">
                        <Hourglass className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{review.dealName}</p>
                          <p className="text-ds-micro text-muted-foreground">{review.requestType}</p>
                        </div>
                      </div>
                      <p className="text-ds-micro text-muted-foreground">
                        Submitted {review.submittedAgo}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-ds-12 p-ds-16 bg-trust-verified/10 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-trust-verified flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-trust-verified">Reviews cleared!</p>
                    <p className="text-ds-micro text-trust-verified">All your submitted work has been reviewed</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-ds-12">
            <Link
              to={createPageUrl('CreateDeal')}
              className="flex flex-col items-center gap-ds-8 p-ds-16 bg-card rounded-lg border border-border hover:border-ink-500 hover:shadow-sm transition-colors"
            >
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Upload Document</span>
            </Link>
            <button
              className="flex flex-col items-center gap-ds-8 p-ds-16 bg-card rounded-lg border border-border hover:border-ink-500 hover:shadow-sm transition-colors"
            >
              <FileText className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Update Deal Field</span>
            </button>
            <button
              className="flex flex-col items-center gap-ds-8 p-ds-16 bg-card rounded-lg border border-border hover:border-ink-500 hover:shadow-sm transition-colors"
            >
              <Send className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Request GP Review</span>
            </button>
            <button
              className="flex flex-col items-center gap-ds-8 p-ds-16 bg-card rounded-lg border border-border hover:border-ink-500 hover:shadow-sm transition-colors"
            >
              <Plus className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Create Task</span>
            </button>
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          <div className="bg-card rounded-lg border border-border p-ds-8">
            <ActivityFeed
              limit={6}
              onActivityClick={(activity) => {
                if (activity.dealId) {
                  window.location.href = createPageUrl(`DealOverview?id=${activity.dealId}`);
                }
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// GP HOME COMPONENT (existing, refactored into separate function)
// =============================================================================

function GPHome({ homeData, newsData, handleAsk, handleDismiss, askMutation, newsLoading, pendingReviews, pendingInvitations, isBroker }) {
  const { currentRole } = useRole();
  const [showCommandCenter, setShowCommandCenter] = useState(true);

  // Convert decision cards to attention items for CommandCenter
  const attentionItems = (homeData?.decisionCards || []).map((card) => ({
    id: card.dealId,
    type: 'deal',
    title: card.dealName,
    description: card.summary,
    urgency: card.status === 'urgent' ? 'blocked' :
             card.status === 'warning' ? 'warning' : 'ready',
    href: createPageUrl(`DealOverview?id=${card.dealId}`),
    action: card.primaryAction ? {
      label: card.primaryAction.label || 'Review',
      onClick: () => window.location.href = createPageUrl(`DealOverview?id=${card.dealId}`)
    } : null,
    timestamp: new Date().toISOString(), // Use current time as fallback
  }));

  // Add pending review requests to attention items
  if (pendingReviews?.requests?.length > 0) {
    pendingReviews.requests.forEach((review) => {
      attentionItems.push({
        id: `review-${review.id}`,
        type: 'review',
        title: `Review Request: ${review.dealName || 'Deal'}`,
        description: review.message || `Requested by ${review.requestedByName || 'Analyst'}`,
        urgency: 'attention',
        href: createPageUrl(`DealOverview?id=${review.dealId}`),
        timestamp: review.requestedAt || new Date().toISOString(),
      });
    });
  }

  // Calculate overdue items for the banner
  const overdueItems = useOverdueItems({
    capitalCalls: homeData?.capitalCalls || [],
    reviews: pendingReviews?.requests || [],
    documents: homeData?.documents || [],
  });

  const quickStartHrefs = {
    'create-deal': createPageUrl('CreateDeal'),
    'model-scenario': createPageUrl('Explain'),
    'lender-update': createPageUrl('AuditExport'),
    'ic-materials': createPageUrl('AuditExport'),
    'portfolio-review': createPageUrl('Deals'),
    'covenant-check': createPageUrl('Compliance'),
    'consent-queue': createPageUrl('Inbox'),
    'document-queue': createPageUrl('Inbox'),
    'upload-draft': createPageUrl('CreateDeal'),
    'matter-status': createPageUrl('Deals')
  };

  const greeting = homeData?.greeting || `Good ${getTimeOfDay()}`;
  const portfolioStatus = homeData?.portfolioStatus || 'Loading...';
  const decisionCards = homeData?.decisionCards || [];
  const changeFeed = homeData?.changeFeed || [];
  const quickStarts = homeData?.quickStarts || [];
  const truthBar = homeData?.truthBar;
  const insights = newsData?.insights || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header Section */}
      <div className="bg-card border-b border-border">
        <div className="max-w-content mx-auto px-ds-24 py-ds-24">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-ds-screen font-semibold text-foreground">{greeting}</h1>
              <p className="text-sm text-muted-foreground mt-ds-4">
                {homeData?.dayOfWeek} • {portfolioStatus}
              </p>
            </div>
            <div className="flex items-center gap-ds-8">
              <Badge variant="outline" className="text-ds-micro">
                {currentRole}
              </Badge>
              {homeData?.portfolioSummary && (
                <Badge variant="secondary" className="text-ds-micro">
                  {homeData.portfolioSummary.totalDeals} deals
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-content mx-auto px-ds-24 py-ds-24 space-y-ds-32">

        {/* Overdue Banner - Top priority alert */}
        <OverdueBanner overdueItems={overdueItems} />

        {/* Truth Bar - Prominent Position */}
        <TruthBar truthBar={truthBar} prominent />

        {/* Broker Invitation Alert - Show for brokers with pending invitations */}
        {isBroker && pendingInvitations?.length > 0 && (
          <InvitationAlertCard invitations={pendingInvitations} />
        )}

        {/* Command Center - Attention-sorted feed with urgency indicators */}
        {showCommandCenter && (
          <CommandCenter
            items={attentionItems}
            onToggleView={() => setShowCommandCenter(false)}
          />
        )}

        {/* Legacy Decisions & Actions Section - Show when CommandCenter is hidden or no attention items */}
        {(!showCommandCenter || attentionItems.length === 0) && decisionCards.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Decisions & Actions — Today
              </h2>
              {!showCommandCenter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCommandCenter(true)}
                  className="text-ds-micro"
                >
                  Show Command Center
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-ds-16">
              {decisionCards.map((card) => (
                <DecisionCard key={card.dealId} card={card} />
              ))}
            </div>
          </section>
        )}

        {/* Analyst Review Requests Section */}
        {pendingReviews?.requests?.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Analyst Review Requests
            </h2>
            <div className="bg-trust-pending/10 rounded-lg border border-trust-pending/20 p-ds-16">
              <div className="space-y-3">
                {pendingReviews.requests.map((review) => (
                  <Link
                    key={review.id}
                    to={createPageUrl(`DealOverview?id=${review.dealId}`)}
                    className="flex items-start gap-ds-12 p-ds-12 bg-card rounded-lg border border-trust-pending/20 hover:border-trust-pending/40 hover:shadow-sm transition-colors"
                  >
                    <Clock className="w-5 h-5 text-trust-pending mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-ds-8 mb-ds-4">
                        <h3 className="font-semibold text-foreground">{review.dealName || 'Deal Review'}</h3>
                        <Badge className="bg-trust-pending/15 text-trust-pending text-ds-micro">
                          Pending Review
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Requested by <span className="font-medium">{review.requestedByName || 'Analyst'}</span>
                        {review.message && <span className="ml-1">— "{review.message}"</span>}
                      </p>
                      <p className="text-ds-micro text-muted-foreground mt-ds-4">
                        {formatTimeAgo(review.requestedAt)}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Deadline Widget - Upcoming deadlines grouped by type */}
        <DeadlineWidget
          capitalCalls={homeData?.capitalCalls || []}
          reviews={pendingReviews?.requests || []}
          documents={homeData?.documents || []}
        />

        {/* Two Column Section: Activity Feed + Quick Starts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Activity Section */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Recent Activity
            </h2>
            <div className="bg-card rounded-lg border border-border p-ds-8">
              <ActivityFeed
                limit={8}
                onActivityClick={(activity) => {
                  // Navigate based on activity type
                  if (activity.dealId) {
                    window.location.href = createPageUrl(`DealOverview?id=${activity.dealId}`);
                  } else if (activity.conversationId) {
                    // Open chat panel - handled by ChatContext
                  }
                }}
              />
            </div>
          </section>

          {/* Quick Starts Section */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Start Something New
            </h2>
            <div className="space-y-2">
              {quickStarts.map((item) => (
                <QuickStartButton
                  key={item.id}
                  item={item}
                  href={quickStartHrefs[item.id]}
                />
              ))}
            </div>
          </section>
        </div>

        {/* AI News & Insights Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              AI News & Insights
            </h2>
            {newsData?._mock && (
              <Badge variant="outline" className="text-ds-micro text-trust-ai border-trust-ai/20">
                Demo Data
              </Badge>
            )}
          </div>

          {newsLoading ? (
            <div className="grid grid-cols-1 gap-ds-16">
              {[1, 2].map(i => (
                <div key={i} className="h-40 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : insights.length > 0 ? (
            <div className="grid grid-cols-1 gap-ds-16">
              {insights.slice(0, 3).map((insight) => (
                <NewsInsightCard
                  key={insight.id}
                  insight={insight}
                  onAsk={handleAsk}
                  onDismiss={handleDismiss}
                  isAsking={askMutation?.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <Newspaper className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm font-medium text-muted-foreground">No news insights yet</p>
              <p className="text-ds-micro text-muted-foreground mt-ds-4">We'll surface relevant market news as it becomes available</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN HOMEPAGE COMPONENT WITH ROLE SWITCHING
// =============================================================================

export default function HomePage() {
  const { currentRole } = useRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Redirect GP Counsel to their specialized dashboard
  if (user?.role && isGPCounselRole(user.role)) {
    return <Navigate to={createPageUrl('GPCounselHome')} replace />;
  }

  // Check if user is a broker - use actual user role, not UI role-switcher
  const isBroker = user?.role === 'Broker';
  console.log('[HomePage] Role check', { userRole: user?.role, currentRole, isBroker });

  // Fetch homepage data
  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ['home', currentRole],
    queryFn: () => bff.home.getData(),
    staleTime: 30000 // 30 seconds
  });

  // Fetch news insights
  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: ['news-insights', currentRole],
    queryFn: () => bff.newsInsights.list(),
    staleTime: 60000 // 1 minute
  });

  // Fetch pending review requests (GP only)
  const { data: pendingReviews } = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: () => bff.reviewRequests.list('pending'),
    enabled: currentRole === 'GP',
    staleTime: 30000 // 30 seconds
  });

  // Fetch broker invitations (Broker only)
  const { data: invitationsData } = useQuery({
    queryKey: ['brokerInvitations'],
    queryFn: () => bff.brokerInvitations.list(),
    enabled: isBroker,
    staleTime: 30000 // 30 seconds
  });

  const pendingInvitations = invitationsData?.invitations?.filter(
    inv => inv.status === 'PENDING'
  ) || [];

  // Ask follow-up mutation
  const askMutation = useMutation({
    mutationFn: ({ insightId, question }) => bff.newsInsights.ask(insightId, question),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-insights'] });
    }
  });

  // Dismiss insight mutation
  const dismissMutation = useMutation({
    mutationFn: (insightId) => bff.newsInsights.dismiss(insightId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-insights'] });
    }
  });

  const handleAsk = async (insightId, question) => {
    return askMutation.mutateAsync({ insightId, question });
  };

  const handleDismiss = (insightId) => {
    dismissMutation.mutate(insightId);
  };

  // Loading state
  if (homeLoading) {
    return (
      <div className="p-8 max-w-content mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-slate-100 rounded w-1/3" />
          <div className="h-6 bg-slate-100 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-ds-16">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Common props for all home components
  const homeProps = {
    homeData,
    newsData,
    handleAsk,
    handleDismiss,
    askMutation,
    newsLoading,
    pendingReviews,
    pendingInvitations,
    isBroker
  };

  // Render appropriate home component based on role
  if (currentRole === 'Lender') {
    return <LenderHome {...homeProps} />;
  }

  if (currentRole === 'Counsel') {
    return <CounselHome {...homeProps} />;
  }

  if (currentRole === 'GP Analyst') {
    return <GPAnalystHome {...homeProps} />;
  }

  // Default: GP, Broker, and all other roles use GPHome
  return <GPHome {...homeProps} />;
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
