type CardProps = { label: string; value: string | number; accent?: string };

function Card({ label, value, accent }: CardProps) {
  return (
    <div className="rounded-lg border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-heading"}`}>{value}</p>
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
      <Card label="Healthy" value={healthy} accent="text-success" />
      <Card label="Warning" value={warning} accent="text-warning" />
      <Card label="Critical" value={critical} accent="text-error" />
      <Card label="Open findings" value={totalFindings} accent={totalFindings > 0 ? "text-error" : "text-heading"} />
    </div>
  );
}
