/**
 * Metric configuration for deal comparison
 * Each metric defines how it should be formatted and what value is "best" for buyers
 */

export const METRICS_CONFIG = {
  propertyName: {
    label: "Property Name",
    format: "text",
    bestIs: null, // no comparison
    key: "propertyName"
  },
  propertyAddress: {
    label: "Address",
    format: "text",
    bestIs: null,
    key: "propertyAddress"
  },
  assetType: {
    label: "Asset Type",
    format: "text",
    bestIs: null,
    key: "assetType"
  },
  askingPrice: {
    label: "Asking Price",
    format: "currency",
    bestIs: "low", // buyers prefer lower prices
    key: "askingPrice"
  },
  pricePerSF: {
    label: "Price/SF",
    format: "currency",
    bestIs: "low",
    key: "pricePerSF",
    computed: true
  },
  capRate: {
    label: "Cap Rate",
    format: "percent",
    bestIs: "high", // higher cap rate = better return
    key: "capRate"
  },
  unitCount: {
    label: "Units",
    format: "number",
    bestIs: "high", // more units = more potential income
    key: "unitCount"
  },
  squareFeet: {
    label: "Square Feet",
    format: "number",
    bestIs: "high",
    key: "squareFeet"
  },
  yearBuilt: {
    label: "Year Built",
    format: "year",
    bestIs: "high", // newer is generally better
    key: "yearBuilt"
  },
  aiScore: {
    label: "AI Score",
    format: "number",
    bestIs: "high",
    key: "aiScore"
  }
};

// Ordered list for table display
export const METRICS_ORDER = [
  "propertyName",
  "propertyAddress",
  "assetType",
  "askingPrice",
  "pricePerSF",
  "capRate",
  "unitCount",
  "squareFeet",
  "yearBuilt",
  "aiScore"
];

// Metrics used for radar chart (numeric only)
export const RADAR_METRICS = ["askingPrice", "capRate", "unitCount", "yearBuilt", "aiScore"];

/**
 * Format a value based on its metric type
 */
export function formatValue(value, format) {
  if (value == null || value === "") return "—";

  switch (format) {
    case "currency":
      const num = Number(value);
      if (!Number.isFinite(num)) return "—";
      if (num >= 1_000_000) {
        return `$${(num / 1_000_000).toFixed(1)}M`;
      }
      return `$${num.toLocaleString()}`;

    case "percent":
      const pct = Number(value);
      if (!Number.isFinite(pct)) return "—";
      return `${pct.toFixed(1)}%`;

    case "number":
      const n = Number(value);
      if (!Number.isFinite(n)) return "—";
      return n.toLocaleString();

    case "year":
      return String(value);

    case "text":
    default:
      return String(value);
  }
}

/**
 * Extract metric value from a deal object
 */
export function extractValue(deal, metricKey) {
  const dealData = deal.distribution?.dealDraft ?? deal;

  switch (metricKey) {
    case "aiScore":
      return deal.aiScore?.relevanceScore ?? null;
    case "pricePerSF":
      const price = Number(dealData.askingPrice);
      const sf = Number(dealData.squareFeet);
      if (Number.isFinite(price) && Number.isFinite(sf) && sf > 0) {
        return Math.round(price / sf);
      }
      return null;
    default:
      return dealData[metricKey] ?? null;
  }
}

/**
 * Find best and worst indices for a set of values
 * Returns indices into the original array
 */
export function getBestWorstIndices(values, bestIs) {
  if (!bestIs) return { best: null, worst: null };

  const indexed = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value != null && !isNaN(Number(value)));

  if (indexed.length < 2) return { best: null, worst: null };

  const sorted = [...indexed].sort((a, b) => {
    const aNum = Number(a.value);
    const bNum = Number(b.value);
    return bestIs === "high" ? bNum - aNum : aNum - bNum;
  });

  return {
    best: sorted[0].index,
    worst: sorted[sorted.length - 1].index
  };
}

/**
 * Normalize values to 0-100 scale for radar chart
 * Handles both "higher is better" and "lower is better" metrics
 */
export function normalizeForRadar(values, bestIs) {
  const numericValues = values.map(v => (v != null ? Number(v) : null));
  const validValues = numericValues.filter(v => v != null && Number.isFinite(v));

  if (validValues.length === 0) {
    return values.map(() => 0);
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min;

  return numericValues.map(v => {
    if (v == null || !Number.isFinite(v)) return 0;

    if (range === 0) return 50; // All values are the same

    // Normalize to 0-100
    let normalized = ((v - min) / range) * 100;

    // Invert if lower is better (e.g., price)
    if (bestIs === "low") {
      normalized = 100 - normalized;
    }

    return Math.round(normalized);
  });
}

// Color palette for deals in charts
export const DEAL_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6"  // violet
];
