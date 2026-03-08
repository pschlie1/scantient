const statusConfig = {
  HEALTHY: { label: "Healthy", bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  WARNING: { label: "Warning", bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
  CRITICAL: { label: "Critical", bg: "bg-error/10", text: "text-error", dot: "bg-error" },
  UNKNOWN: { label: "Pending", bg: "bg-surface-raised", text: "text-body", dot: "bg-muted" },
} as const;

type Status = keyof typeof statusConfig;

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as Status] ?? statusConfig.UNKNOWN;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

const severityConfig = {
  CRITICAL: { bg: "bg-error/10", text: "text-error", border: "border-error" },
  HIGH: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
  MEDIUM: { bg: "bg-warning/10", text: "text-warning", border: "border-warning" },
  LOW: { bg: "bg-info/10", text: "text-info", border: "border-info" },
} as const;

type Severity = keyof typeof severityConfig;

export function SeverityBadge({ severity }: { severity: string }) {
  const config = severityConfig[severity as Severity] ?? severityConfig.LOW;

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${config.bg} ${config.text}`}>
      {severity}
    </span>
  );
}
