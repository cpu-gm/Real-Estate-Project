import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FileCheck,
  User,
  Database,
  HelpCircle
} from 'lucide-react';

// Badge configuration for each verification type
const BADGE_CONFIG = {
  SELLER_ATTESTED: {
    label: 'Seller Attested',
    shortLabel: 'Seller',
    description: 'This information was provided and confirmed by the property seller.',
    icon: User,
    color: 'bg-green-100 text-green-700 border-green-200',
    reliability: 'High - Direct from seller',
  },
  DOCUMENT_VERIFIED: {
    label: 'Document Verified',
    shortLabel: 'Verified',
    description: 'This information was extracted from an uploaded document.',
    icon: FileCheck,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    reliability: 'High - Backed by documents',
  },
  BROKER_ASSUMPTION: {
    label: 'Broker Assumption',
    shortLabel: 'Estimate',
    description: 'This is an estimate or projection created by the broker.',
    icon: HelpCircle,
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    reliability: 'Medium - Broker projection',
  },
  THIRD_PARTY: {
    label: 'Third Party Data',
    shortLabel: '3rd Party',
    description: 'This data comes from a third-party source (CoStar, public records, etc.).',
    icon: Database,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    reliability: 'Medium-High - External source',
  },
};

/**
 * ProvenanceBadge - Shows the source/reliability of a claim
 *
 * @param {Object} props
 * @param {string} props.badge - The verification badge type (SELLER_ATTESTED, DOCUMENT_VERIFIED, etc.)
 * @param {string} props.source - Optional additional source info
 * @param {boolean} props.compact - Use compact display (icon only)
 * @param {boolean} props.showTooltip - Show tooltip with details (default true)
 */
export default function ProvenanceBadge({ badge, source, compact = false, showTooltip = true }) {
  const config = BADGE_CONFIG[badge];

  if (!config) {
    // Unknown or no badge
    return null;
  }

  const Icon = config.icon;

  const badgeContent = (
    <Badge
      variant="outline"
      className={`${config.color} cursor-help ${compact ? 'px-1.5' : ''}`}
    >
      <Icon className={`h-3 w-3 ${compact ? '' : 'mr-1'}`} />
      {!compact && <span className="text-xs">{config.shortLabel}</span>}
    </Badge>
  );

  if (!showTooltip) {
    return badgeContent;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-slate-500">{config.description}</p>
            <p className="text-xs text-slate-400">Reliability: {config.reliability}</p>
            {source && (
              <p className="text-xs text-slate-400 mt-1">Source: {source}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * ProvenanceLegend - Shows a legend of all badge types
 */
export function ProvenanceLegend({ className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {Object.entries(BADGE_CONFIG).map(([key, config]) => {
        const Icon = config.icon;
        return (
          <Badge
            key={key}
            variant="outline"
            className={`${config.color} text-xs`}
          >
            <Icon className="h-3 w-3 mr-1" />
            {config.shortLabel}
          </Badge>
        );
      })}
    </div>
  );
}

/**
 * Get badge configuration by type
 */
export function getBadgeConfig(badge) {
  return BADGE_CONFIG[badge] || null;
}

/**
 * All available badge types
 */
export const BADGE_TYPES = Object.keys(BADGE_CONFIG);
