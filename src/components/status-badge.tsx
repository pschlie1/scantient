const statusConfig = {
  HEALTHY: { label: "Healthy", bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  WARNING: { label: "Warning", bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  CRITICAL: { label: "Critical", bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
  UNKNOWN: { label: "Pending", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
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
  CRITICAL: { bg: "bg-red-100", text: "text-red-800", border: "border-red-200" },
  HIGH: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
  MEDIUM: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" },
  LOW: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
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
