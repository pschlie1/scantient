"use client";

import dynamic from "next/dynamic";

const TrendCharts = dynamic(() => import("./trend-chart").then((m) => ({ default: m.TrendCharts })), {
  ssr: false,
  loading: () => <div className="py-8 text-center text-sm text-muted">Loading charts...</div>,
});

export { TrendCharts };
