import React from "react";
import { Building2, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AIScoreBadge } from "@/components/distribution/AIScoreBadge";
import { cn } from "@/lib/utils";

const formatMoney = (value) => {
  if (value == null) return "TBD";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "TBD";
  if (parsed >= 1_000_000) {
    return `$${(parsed / 1_000_000).toFixed(1)}M`;
  }
  return `$${parsed.toLocaleString()}`;
};

const formatPercent = (value) => {
  if (value == null) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed.toFixed(1)}%`;
};

export function DealSelectorCard({
  deal,
  isSelected,
  isDisabled,
  onToggle
}) {
  const dealData = deal.distribution?.dealDraft ?? {};
  const aiScore = deal.aiScore?.relevanceScore;

  const handleClick = () => {
    if (!isDisabled || isSelected) {
      onToggle(dealData.id);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isSelected && "ring-2 ring-blue-500 bg-blue-50/50",
        isDisabled && !isSelected && "opacity-50 cursor-not-allowed"
      )}
      onClick={handleClick}
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            disabled={isDisabled && !isSelected}
            onCheckedChange={() => handleClick()}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <h3 className="font-semibold text-[#171717] truncate">
                {dealData.propertyName || "Untitled deal"}
              </h3>
            </div>
            <div className="flex items-center gap-1 text-sm text-[#737373] mb-2">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{dealData.propertyAddress || "Address pending"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#525252]">
              <span className="font-medium">{formatMoney(dealData.askingPrice)}</span>
              <span>{dealData.assetType || "—"}</span>
              {dealData.capRate && (
                <span>Cap: {formatPercent(dealData.capRate)}</span>
              )}
              {dealData.unitCount && (
                <span>{dealData.unitCount} units</span>
              )}
            </div>
          </div>
          {aiScore != null && (
            <div className="flex-shrink-0">
              <AIScoreBadge score={aiScore} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
