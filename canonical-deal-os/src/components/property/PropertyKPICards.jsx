import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Users,
  Percent,
  PiggyBank
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(0)}K`;
  }
  return `$${num.toLocaleString()}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(1)}%`;
}

function TrendIndicator({ value, suffix = '' }) {
  if (value === null || value === undefined) return null;

  const num = typeof value === 'string' ? parseFloat(value) : value;
  const isPositive = num > 0;
  const isNeutral = num === 0;

  return (
    <div className={cn(
      'flex items-center text-sm',
      isPositive && 'text-green-600',
      !isPositive && !isNeutral && 'text-red-600',
      isNeutral && 'text-slate-500'
    )}>
      {isPositive && <TrendingUp className="h-3 w-3 mr-1" />}
      {!isPositive && !isNeutral && <TrendingDown className="h-3 w-3 mr-1" />}
      {isNeutral && <Minus className="h-3 w-3 mr-1" />}
      <span>{isPositive && '+'}{num.toFixed(1)}{suffix}</span>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, trend, trendLabel, className }) {
  return (
    <Card className={cn('bg-white', className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            {(trend !== null && trend !== undefined) && (
              <div className="mt-1 flex items-center gap-1">
                <TrendIndicator value={trend} suffix="%" />
                {trendLabel && (
                  <span className="text-xs text-slate-400">{trendLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon className="h-5 w-5 text-slate-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PropertyKPICards({
  noi,
  noiChange,
  occupancy,
  occupancyChange,
  cashOnCash,
  cashOnCashTarget,
  equity,
  equityGain
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        icon={DollarSign}
        label="Current NOI"
        value={formatCurrency(noi)}
        trend={noiChange}
        trendLabel="YoY"
      />

      <KPICard
        icon={Users}
        label="Occupancy"
        value={formatPercent(occupancy)}
        trend={occupancyChange}
        trendLabel="vs last month"
      />

      <KPICard
        icon={Percent}
        label="Cash-on-Cash"
        value={formatPercent(cashOnCash)}
        trend={cashOnCashTarget ? cashOnCash - cashOnCashTarget : null}
        trendLabel={cashOnCashTarget ? `vs ${cashOnCashTarget}% target` : null}
      />

      <KPICard
        icon={PiggyBank}
        label="Equity"
        value={formatCurrency(equity)}
        trend={equityGain ? (equityGain / (equity - equityGain)) * 100 : null}
        trendLabel="since acquisition"
      />
    </div>
  );
}

// Export individual card for custom use
export { KPICard, formatCurrency, formatPercent };
