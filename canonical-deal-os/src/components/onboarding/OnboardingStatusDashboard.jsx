import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  FileText,
  Users,
  Building2,
  DollarSign,
  Briefcase,
  ChevronRight,
  Eye,
  Zap,
  MessageSquare
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Category icons and colors
const CATEGORY_CONFIG = {
  deals: { icon: Briefcase, color: 'text-blue-500', bgColor: 'bg-blue-50' },
  contacts: { icon: Users, color: 'text-green-500', bgColor: 'bg-green-50' },
  properties: { icon: Building2, color: 'text-purple-500', bgColor: 'bg-purple-50' },
  documents: { icon: FileText, color: 'text-orange-500', bgColor: 'bg-orange-50' },
  financials: { icon: DollarSign, color: 'text-emerald-500', bgColor: 'bg-emerald-50' },
  lp_records: { icon: Users, color: 'text-indigo-500', bgColor: 'bg-indigo-50' }
};

// Stage configurations
const STAGE_CONFIG = {
  processing: { label: 'Processing', color: 'bg-blue-500', icon: RefreshCw },
  spot_check: { label: 'Spot Check', color: 'bg-amber-500', icon: Eye },
  team_review: { label: 'Team Review', color: 'bg-purple-500', icon: Users },
  ready: { label: 'Ready', color: 'bg-green-500', icon: CheckCircle2 }
};

function CategoryProgressCard({ category, progress, total, verified, hasIssues = false, onClick }) {
  const config = CATEGORY_CONFIG[category.toLowerCase()] || CATEGORY_CONFIG.deals;
  const IconComponent = config.icon;
  const percent = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer",
        hasIssues && "border-amber-200 bg-amber-50/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-md", config.bgColor)}>
            <IconComponent className={cn("w-4 h-4", config.color)} />
          </div>
          <span className="font-medium text-slate-900 capitalize">{category}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {hasIssues && (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
          <span className="text-sm text-slate-500">{percent}%</span>
        </div>
      </div>

      <Progress value={percent} className="h-2 mb-2" />

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{progress} of {total} processed</span>
        {verified > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            {verified} verified
          </span>
        )}
      </div>
    </div>
  );
}

function StagePipelineCard({ stages, onStageClick }) {
  return (
    <div className="space-y-3">
      {Object.entries(STAGE_CONFIG).map(([stageKey, config]) => {
        const stageData = stages[stageKey] || { count: 0, items: [] };
        const IconComponent = config.icon;

        return (
          <div
            key={stageKey}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-colors",
              stageData.count > 0
                ? "border-slate-200 hover:border-slate-300 cursor-pointer"
                : "border-slate-100 bg-slate-50/50"
            )}
            onClick={() => stageData.count > 0 && onStageClick?.(stageKey)}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-white",
              stageData.count > 0 ? config.color : "bg-slate-200"
            )}>
              <IconComponent className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "font-medium",
                  stageData.count > 0 ? "text-slate-900" : "text-slate-400"
                )}>
                  {config.label}
                </span>
                <Badge
                  variant={stageData.count > 0 ? "secondary" : "outline"}
                  className={cn(
                    "text-xs",
                    stageData.count === 0 && "text-slate-400"
                  )}
                >
                  {stageData.count}
                </Badge>
              </div>
              {stageData.items.length > 0 && (
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {stageData.items.slice(0, 3).map(i => i.name).join(', ')}
                  {stageData.items.length > 3 && ` +${stageData.items.length - 3} more`}
                </p>
              )}
            </div>

            {stageData.count > 0 && (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityFeedItem({ activity }) {
  const getActivityIcon = (type) => {
    switch (type) {
      case 'extraction': return <Zap className="w-3.5 h-3.5 text-blue-500" />;
      case 'verification': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      case 'question': return <MessageSquare className="w-3.5 h-3.5 text-amber-500" />;
      case 'error': return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
      default: return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5">
        {getActivityIcon(activity.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">
          {activity.message}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export default function OnboardingStatusDashboard({
  session,
  categories = [],
  stages = {},
  activities = [],
  onCategoryClick,
  onStageClick,
  onViewAllActivity,
  className
}) {
  // Calculate overall progress
  const totalRecords = session?.totalRecords || 0;
  const processedRecords = session?.processedRecords || 0;
  const verifiedRecords = session?.verifiedRecords || 0;
  const overallPercent = totalRecords > 0 ? Math.round((processedRecords / totalRecords) * 100) : 0;

  // Estimate completion
  const estimatedCompletion = session?.estimatedCompletionAt
    ? formatDistanceToNow(new Date(session.estimatedCompletionAt), { addSuffix: true })
    : null;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Overall Progress Header */}
      <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Import Progress</h2>
              <p className="text-slate-300 text-sm">
                {session?.status === 'PROCESSING' && 'AI is processing your files...'}
                {session?.status === 'REVIEW' && 'Ready for your review'}
                {session?.status === 'TEAM_REVIEW' && 'Our team is reviewing'}
                {session?.status === 'READY' && 'Import complete!'}
              </p>
            </div>
            {estimatedCompletion && session?.status === 'PROCESSING' && (
              <Badge className="bg-white/20 text-white">
                <Clock className="w-3 h-3 mr-1" />
                Est. {estimatedCompletion}
              </Badge>
            )}
          </div>

          <Progress value={overallPercent} className="h-3 bg-slate-700" />

          <div className="flex items-center justify-between mt-3 text-sm">
            <span className="text-slate-300">
              {processedRecords.toLocaleString()} of {totalRecords.toLocaleString()} records
            </span>
            <span className="font-semibold">{overallPercent}%</span>
          </div>

          {verifiedRecords > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-300">
              <CheckCircle2 className="w-4 h-4" />
              {verifiedRecords.toLocaleString()} records verified
            </div>
          )}
        </CardContent>
      </Card>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Category Progress</CardTitle>
            <CardDescription>Progress by data type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories.map(cat => (
              <CategoryProgressCard
                key={cat.name}
                category={cat.name}
                progress={cat.processed}
                total={cat.total}
                verified={cat.verified}
                hasIssues={cat.hasIssues}
                onClick={() => onCategoryClick?.(cat.name)}
              />
            ))}
            {categories.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-500">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 text-slate-300 animate-spin" />
                <p>Analyzing your files...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stage Pipeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Processing Pipeline</CardTitle>
            <CardDescription>Records by stage</CardDescription>
          </CardHeader>
          <CardContent>
            <StagePipelineCard stages={stages} onStageClick={onStageClick} />
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>Real-time updates</CardDescription>
            </div>
            {activities.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onViewAllActivity}>
                View All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-3">
              {activities.length > 0 ? (
                activities.map((activity, index) => (
                  <ActivityFeedItem key={activity.id || index} activity={activity} />
                ))
              ) : (
                <div className="text-center py-8 text-sm text-slate-500">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p>Activity will appear here</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
