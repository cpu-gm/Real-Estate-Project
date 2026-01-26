import React, { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  METRICS_ORDER,
  METRICS_CONFIG,
  formatValue,
  extractValue,
  getBestWorstIndices,
  DEAL_COLORS
} from "@/lib/comparison/metrics";
import { cn } from "@/lib/utils";

export function ComparisonTable({ deals }) {
  // Pre-compute all metric values and best/worst indices
  const metricsData = useMemo(() => {
    return METRICS_ORDER.map(metricKey => {
      const config = METRICS_CONFIG[metricKey];
      const values = deals.map(deal => extractValue(deal, metricKey));
      const { best, worst } = getBestWorstIndices(values, config.bestIs);

      return {
        metricKey,
        config,
        values,
        best,
        worst
      };
    });
  }, [deals]);

  // Get deal names for header
  const dealNames = deals.map(deal => {
    const dealData = deal.distribution?.dealDraft ?? deal;
    return dealData.propertyName || "Untitled";
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#F9FAFB]">
            <TableHead className="w-32 font-semibold text-[#171717]">Metric</TableHead>
            {dealNames.map((name, idx) => (
              <TableHead key={idx} className="font-semibold text-[#171717]">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: DEAL_COLORS[idx] }}
                  />
                  <span className="truncate max-w-[150px]">{name}</span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {metricsData.map(({ metricKey, config, values, best, worst }) => (
            <TableRow key={metricKey}>
              <TableCell className="font-medium text-[#525252] bg-[#F9FAFB]">
                {config.label}
              </TableCell>
              {values.map((value, idx) => {
                const isBest = best === idx;
                const isWorst = worst === idx;

                return (
                  <TableCell
                    key={idx}
                    className={cn(
                      "transition-colors",
                      isBest && "bg-green-50 text-green-700 font-semibold",
                      isWorst && "bg-red-50 text-red-700"
                    )}
                  >
                    {formatValue(value, config.format)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
