import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import { AlertTriangle, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

const logger = createLogger('ui:urgency');

/**
 * Calculate urgency level based on due date
 * @param {Date|string} dueDate - The due date
 * @returns {'overdue'|'critical'|'warning'|'soon'|'normal'} - Urgency level
 */
export function calculateUrgencyLevel(dueDate) {
  if (!dueDate) return 'normal';

  const now = new Date();
  const due = new Date(dueDate);

  // Reset time to compare days only
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueDay.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  logger.debug('Urgency calculated', { dueDate, diffDays });

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'critical';
  if (diffDays <= 3) return 'warning';
  if (diffDays <= 7) return 'soon';
  return 'normal';
}

/**
 * Get days until/since due date
 * @param {Date|string} dueDate - The due date
 * @returns {number} - Days (negative if overdue)
 */
export function getDaysUntilDue(dueDate) {
  if (!dueDate) return null;

  const now = new Date();
  const due = new Date(dueDate);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueDay.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format countdown text
 * @param {number} days - Days until due (negative if overdue)
 * @returns {string} - Formatted text
 */
export function formatCountdown(days) {
  if (days === null || days === undefined) return '';

  if (days < 0) {
    const absDays = Math.abs(days);
    return absDays === 1 ? '1 day overdue' : `${absDays} days overdue`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days`;
}

// Style configuration for each urgency level
const URGENCY_STYLES = {
  overdue: {
    bg: 'bg-red-500/20',
    border: 'border-red-500/40',
    text: 'text-red-300',
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    dot: 'bg-red-500',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]', // Red glow for overdue
  },
  critical: {
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/40',
    text: 'text-orange-300',
    icon: AlertCircle,
    iconColor: 'text-orange-400',
    dot: 'bg-orange-500',
    glow: 'shadow-[0_0_12px_rgba(249,115,22,0.4)]', // Orange glow for critical
  },
  warning: {
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    text: 'text-amber-300',
    icon: AlertCircle,
    iconColor: 'text-amber-400',
    dot: 'bg-amber-500',
    glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]',
  },
  soon: {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/40',
    text: 'text-yellow-300',
    icon: Clock,
    iconColor: 'text-yellow-400',
    dot: 'bg-yellow-500',
    glow: '',
  },
  normal: {
    bg: 'bg-green-500/20',
    border: 'border-green-500/40',
    text: 'text-green-300',
    icon: CheckCircle2,
    iconColor: 'text-green-400',
    dot: 'bg-green-500',
    glow: '',
  },
};

/**
 * UrgencyBadge Component
 *
 * Displays a color-coded badge indicating urgency based on due date.
 *
 * @param {Object} props
 * @param {Date|string} props.dueDate - The due date
 * @param {boolean} props.showIcon - Show icon (default: true)
 * @param {boolean} props.showCountdown - Show countdown text (default: true)
 * @param {boolean} props.showDot - Show colored dot instead of icon (default: false)
 * @param {'sm'|'md'|'lg'} props.size - Size variant (default: 'md')
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.pulse - Add pulse animation for urgent items (default: true for overdue/critical)
 */
export default function UrgencyBadge({
  dueDate,
  showIcon = true,
  showCountdown = true,
  showDot = false,
  size = 'md',
  className,
  pulse,
}) {
  const [level, setLevel] = useState(() => calculateUrgencyLevel(dueDate));
  const [days, setDays] = useState(() => getDaysUntilDue(dueDate));

  // Update urgency level when dueDate changes or on interval
  useEffect(() => {
    const updateUrgency = () => {
      setLevel(calculateUrgencyLevel(dueDate));
      setDays(getDaysUntilDue(dueDate));
    };

    updateUrgency();

    // Update every minute to keep countdown fresh
    const interval = setInterval(updateUrgency, 60000);
    return () => clearInterval(interval);
  }, [dueDate]);

  if (!dueDate) return null;

  const styles = URGENCY_STYLES[level];
  const Icon = styles.icon;
  const shouldPulse = pulse ?? (level === 'overdue' || level === 'critical');

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'px-1.5 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
      dot: 'w-1.5 h-1.5',
    },
    md: {
      container: 'px-2 py-1 text-xs gap-1.5',
      icon: 'w-3.5 h-3.5',
      dot: 'w-2 h-2',
    },
    lg: {
      container: 'px-2.5 py-1.5 text-sm gap-2',
      icon: 'w-4 h-4',
      dot: 'w-2.5 h-2.5',
    },
  };

  const sizeConfig = sizeClasses[size];

  return (
    <span
      data-testid="urgency-badge"
      data-level={level}
      data-days={days}
      className={cn(
        'inline-flex items-center rounded-full border font-medium backdrop-blur-sm',
        styles.bg,
        styles.border,
        styles.text,
        styles.glow,
        sizeConfig.container,
        shouldPulse && 'pulse-urgent',
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'rounded-full flex-shrink-0',
            styles.dot,
            sizeConfig.dot
          )}
        />
      )}
      {showIcon && !showDot && (
        <Icon className={cn(styles.iconColor, sizeConfig.icon, 'flex-shrink-0')} />
      )}
      {showCountdown && (
        <span data-testid="countdown" className="whitespace-nowrap">
          {formatCountdown(days)}
        </span>
      )}
    </span>
  );
}

/**
 * UrgencyDot Component
 *
 * Minimal urgency indicator - just a colored dot.
 */
export function UrgencyDot({ dueDate, size = 'md', className }) {
  const level = calculateUrgencyLevel(dueDate);
  const styles = URGENCY_STYLES[level];

  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  return (
    <span
      data-testid="urgency-dot"
      data-level={level}
      className={cn(
        'rounded-full inline-block',
        styles.dot,
        sizeClasses[size],
        className
      )}
    />
  );
}

/**
 * useUrgency Hook
 *
 * Hook to get urgency level and related info for a due date.
 */
export function useUrgency(dueDate) {
  const [state, setState] = useState(() => ({
    level: calculateUrgencyLevel(dueDate),
    days: getDaysUntilDue(dueDate),
    countdown: formatCountdown(getDaysUntilDue(dueDate)),
    styles: URGENCY_STYLES[calculateUrgencyLevel(dueDate)],
  }));

  useEffect(() => {
    const update = () => {
      const level = calculateUrgencyLevel(dueDate);
      const days = getDaysUntilDue(dueDate);
      setState({
        level,
        days,
        countdown: formatCountdown(days),
        styles: URGENCY_STYLES[level],
      });
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [dueDate]);

  return state;
}
