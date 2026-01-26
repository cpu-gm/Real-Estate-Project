import React from 'react';
import { Shield, ShieldAlert, ShieldX, ShieldCheck } from 'lucide-react';

/**
 * Risk score badge component
 * @param {number} score - Risk score from 1-10
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} showLabel - Show risk level label
 */
export default function RiskScoreBadge({ score, size = 'md', showLabel = true }) {
  // Determine risk level
  const getRiskLevel = (score) => {
    if (score <= 2) return { level: 'Low', color: 'green', Icon: ShieldCheck };
    if (score <= 4) return { level: 'Minor', color: 'blue', Icon: Shield };
    if (score <= 6) return { level: 'Medium', color: 'yellow', Icon: ShieldAlert };
    if (score <= 8) return { level: 'High', color: 'orange', Icon: ShieldAlert };
    return { level: 'Critical', color: 'red', Icon: ShieldX };
  };

  const { level, color, Icon } = getRiskLevel(score);

  // Size configurations
  const sizeConfig = {
    sm: {
      wrapper: 'px-1.5 py-0.5',
      icon: 'w-3 h-3',
      text: 'text-xs',
      score: 'text-xs font-bold'
    },
    md: {
      wrapper: 'px-2 py-1',
      icon: 'w-4 h-4',
      text: 'text-sm',
      score: 'text-sm font-bold'
    },
    lg: {
      wrapper: 'px-3 py-1.5',
      icon: 'w-5 h-5',
      text: 'text-base',
      score: 'text-base font-bold'
    }
  };

  // Color configurations
  const colorConfig = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: 'text-green-500'
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: 'text-blue-500'
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      icon: 'text-yellow-500'
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-700',
      icon: 'text-orange-500'
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'text-red-500'
    }
  };

  const sizes = sizeConfig[size];
  const colors = colorConfig[color];

  return (
    <div
      className={`
        inline-flex items-center space-x-1 rounded-full border
        ${sizes.wrapper} ${colors.bg} ${colors.border}
      `}
      title={`Risk Score: ${score}/10 (${level})`}
    >
      <Icon className={`${sizes.icon} ${colors.icon}`} />
      <span className={`${sizes.score} ${colors.text}`}>{score}</span>
      {showLabel && (
        <span className={`${sizes.text} ${colors.text}`}>{level}</span>
      )}
    </div>
  );
}

/**
 * Larger risk score display for detail views
 */
export function RiskScoreDisplay({ score, explanation }) {
  const getRiskLevel = (score) => {
    if (score <= 2) return { level: 'Low Risk', color: 'green', description: 'Standard terms, well-balanced' };
    if (score <= 4) return { level: 'Minor Concerns', color: 'blue', description: 'Minor deviations from standard' };
    if (score <= 6) return { level: 'Moderate Risk', color: 'yellow', description: 'Some unusual terms requiring attention' };
    if (score <= 8) return { level: 'High Risk', color: 'orange', description: 'Significant concerns, unfavorable terms' };
    return { level: 'Critical Risk', color: 'red', description: 'High risk, strongly unfavorable' };
  };

  const { level, color, description } = getRiskLevel(score);

  const colorConfig = {
    green: { bg: 'bg-green-100', ring: 'ring-green-500', text: 'text-green-800' },
    blue: { bg: 'bg-blue-100', ring: 'ring-blue-500', text: 'text-blue-800' },
    yellow: { bg: 'bg-yellow-100', ring: 'ring-yellow-500', text: 'text-yellow-800' },
    orange: { bg: 'bg-orange-100', ring: 'ring-orange-500', text: 'text-orange-800' },
    red: { bg: 'bg-red-100', ring: 'ring-red-500', text: 'text-red-800' }
  };

  const colors = colorConfig[color];

  return (
    <div className={`p-4 rounded-lg ${colors.bg} ring-1 ${colors.ring}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-lg font-semibold ${colors.text}`}>{level}</span>
        <div className="flex items-center space-x-2">
          <span className={`text-3xl font-bold ${colors.text}`}>{score}</span>
          <span className={`text-lg ${colors.text}`}>/10</span>
        </div>
      </div>
      <p className={`text-sm ${colors.text} opacity-80`}>{description}</p>
      {explanation && (
        <p className="mt-2 text-sm text-gray-700">{explanation}</p>
      )}
    </div>
  );
}
