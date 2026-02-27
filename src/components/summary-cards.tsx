type CardProps = { label: string; value: string | number; accent?: string };

function Card({ label, value, accent }: CardProps) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

type Props = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  totalFindings: number;
};

export function SummaryCards({ total, healthy, warning, critical, totalFindings }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Card label="Monitored apps" value={total} />
      <Card label="Healthy" value={healthy} accent="text-green-600" />
      <Card label="Warning" value={warning} accent="text-yellow-600" />
      <Card label="Critical" value={critical} accent="text-red-600" />
      <Card label="Open findings" value={totalFindings} accent={totalFindings > 0 ? "text-red-600" : "text-gray-900"} />
    </div>
  );
}
