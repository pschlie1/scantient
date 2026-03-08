"use client";

import { useEffect, useState } from "react";

interface OrgMetrics {
  mtta: number | null;
  mttr: number | null;
  fixRates: Record<string, { total: number; resolved: number; rate: number }>;
  velocityTrend: { weekStart: string; mttr: number | null; resolved: number }[];
  slaCompliance: {
    critical24h: { total: number; compliant: number; rate: number };
    high72h: { total: number; compliant: number; rate: number };
  };
  resolvedThisWeek: number;
}

function MetricCard({
  label,
  value,
  subtext,
  trend,
}: {
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "flat";
}) {
  const trendIcon = trend === "down" ? "↓" : trend === "up" ? "↑" : "";
  const trendColor =
    trend === "down" ? "text-success" : trend === "up" ? "text-error" : "text-muted";

  return (
    <div className="rounded-lg border bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-heading">{value}</span>
        {trendIcon && <span className={`text-sm font-semibold ${trendColor}`}>{trendIcon}</span>}
      </div>
      {subtext && <p className="mt-1 text-xs text-muted">{subtext}</p>}
    </div>
  );
}

export function MetricsDashboard() {
  const [metrics, setMetrics] = useState<OrgMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMetrics(d as OrgMetrics | null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-surface-raised" />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  // Determine MTTR trend from velocity data
  const trend = metrics.velocityTrend;
  const recent = trend.length >= 2 ? trend[trend.length - 1] : null;
  const previous = trend.length >= 2 ? trend[trend.length - 2] : null;
  let mttrTrend: "up" | "down" | "flat" = "flat";
  let mttrChangeText = "";
  if (recent?.mttr != null && previous?.mttr != null && previous.mttr > 0) {
    const pctChange = Math.round(((recent.mttr - previous.mttr) / previous.mttr) * 100);
    if (pctChange < -5) {
      mttrTrend = "down";
      mttrChangeText = `${Math.abs(pctChange)}% faster than last week`;
    } else if (pctChange > 5) {
      mttrTrend = "up";
      mttrChangeText = `${pctChange}% slower than last week`;
    } else {
      mttrChangeText = "Stable vs last week";
    }
  }

  const overallFixRate =
    Object.values(metrics.fixRates).reduce((s, v) => s + v.resolved, 0) /
    Math.max(Object.values(metrics.fixRates).reduce((s, v) => s + v.total, 0), 1);

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-heading">Remediation Metrics</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="MTTR"
          value={metrics.mttr != null ? `${metrics.mttr}h` : "—"}
          subtext={mttrChangeText || "Mean time to remediate"}
          trend={mttrTrend}
        />
        <MetricCard
          label="Fix Rate"
          value={`${Math.round(overallFixRate * 100)}%`}
          subtext={`Critical: ${metrics.fixRates["CRITICAL"]?.rate ?? 0}% · High: ${metrics.fixRates["HIGH"]?.rate ?? 0}%`}
        />
        <MetricCard
          label="SLA Compliance"
          value={`${metrics.slaCompliance.critical24h.rate}%`}
          subtext={`Critical <24h · High <72h: ${metrics.slaCompliance.high72h.rate}%`}
        />
        <MetricCard
          label="Resolved This Week"
          value={String(metrics.resolvedThisWeek)}
          subtext={metrics.mtta != null ? `Avg acknowledge: ${metrics.mtta}h` : "MTTA: —"}
        />
      </div>
    </div>
  );
}
