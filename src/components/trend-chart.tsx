"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { chartColors } from "@/lib/chart-colors";

interface TrendPoint {
  date: string;
  score: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TrendCharts({ appId }: { appId: string }) {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/apps/${appId}/trends`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appId]);

  if (loading) return <div className="py-8 text-center text-sm text-muted">Loading trends…</div>;
  if (data.length < 2) return <div className="py-8 text-center text-sm text-muted">Not enough scan data for trends yet.</div>;

  const chartData = data.map((d) => ({ ...d, date: formatDate(d.date) }));

  return (
    <div className="space-y-8">
      {/* Security Score Over Time */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-heading">Security Score Over Time</h3>
        <div className="rounded-lg border bg-surface p-4">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="score"
                stroke={chartColors.info}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Score"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Findings by Severity Over Time */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-heading">Findings by Severity</h3>
        <div className="rounded-lg border bg-surface p-4">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="critical" stackId="1" fill={chartColors.critical} stroke={chartColors.critical} name="Critical" />
              <Area type="monotone" dataKey="high" stackId="1" fill={chartColors.high} stroke={chartColors.high} name="High" />
              <Area type="monotone" dataKey="medium" stackId="1" fill={chartColors.medium} stroke={chartColors.medium} name="Medium" />
              <Area type="monotone" dataKey="low" stackId="1" fill={chartColors.low} stroke={chartColors.low} name="Low" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
