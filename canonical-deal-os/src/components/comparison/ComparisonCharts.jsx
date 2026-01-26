import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  METRICS_CONFIG,
  RADAR_METRICS,
  extractValue,
  normalizeForRadar,
  DEAL_COLORS
} from "@/lib/comparison/metrics";

// Custom tooltip for bar chart
function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-[#171717] mb-1">{data.fullName}</p>
      <p className="text-[#525252]">
        {data.price >= 1_000_000
          ? `$${(data.price / 1_000_000).toFixed(2)}M`
          : `$${data.price.toLocaleString()}`}
      </p>
    </div>
  );
}

// Custom tooltip for radar chart
function RadarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-[#171717] mb-1">{payload[0].payload.metric}</p>
      {payload.map((entry, idx) => (
        <p key={idx} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export function ComparisonCharts({ deals }) {
  // Prepare data for price bar chart
  const priceChartData = useMemo(() => {
    return deals.map((deal, idx) => {
      const dealData = deal.distribution?.dealDraft ?? deal;
      const price = Number(dealData.askingPrice) || 0;
      const name = dealData.propertyName || `Deal ${idx + 1}`;

      return {
        name: name.length > 15 ? name.substring(0, 15) + "..." : name,
        fullName: name,
        price,
        fill: DEAL_COLORS[idx]
      };
    });
  }, [deals]);

  // Prepare data for radar chart
  const radarChartData = useMemo(() => {
    // For each radar metric, normalize values across all deals
    return RADAR_METRICS.map(metricKey => {
      const config = METRICS_CONFIG[metricKey];
      const values = deals.map(deal => extractValue(deal, metricKey));
      const normalized = normalizeForRadar(values, config.bestIs);

      const dataPoint = {
        metric: config.label
      };

      deals.forEach((deal, idx) => {
        const dealData = deal.distribution?.dealDraft ?? deal;
        const name = dealData.propertyName || `Deal ${idx + 1}`;
        dataPoint[name] = normalized[idx];
      });

      return dataPoint;
    });
  }, [deals]);

  // Get deal names for radar legend
  const dealNames = deals.map((deal, idx) => {
    const dealData = deal.distribution?.dealDraft ?? deal;
    return dealData.propertyName || `Deal ${idx + 1}`;
  });

  // Format Y axis for price chart
  const formatYAxis = (value) => {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(0)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Price Comparison Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Asking Price Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priceChartData} margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#525252" }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 12, fill: "#525252" }}
                  width={60}
                />
                <Tooltip content={<PriceTooltip />} />
                <Bar
                  dataKey="price"
                  radius={[4, 4, 0, 0]}
                  fill="#3b82f6"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Metric Radar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Multi-Metric Comparison</CardTitle>
          <p className="text-xs text-[#737373]">
            Normalized scores (higher = better for buyer)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarChartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <PolarGrid stroke="#e5e5e5" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: "#525252" }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "#737373" }}
                />
                {dealNames.map((name, idx) => (
                  <Radar
                    key={name}
                    name={name}
                    dataKey={name}
                    stroke={DEAL_COLORS[idx]}
                    fill={DEAL_COLORS[idx]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                ))}
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => (
                    <span className="text-[#525252]">
                      {value.length > 20 ? value.substring(0, 20) + "..." : value}
                    </span>
                  )}
                />
                <Tooltip content={<RadarTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
