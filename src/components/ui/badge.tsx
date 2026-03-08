import { type HTMLAttributes, forwardRef } from "react";

type BadgeVariant =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "healthy"
  | "warning"
  | "error"
  | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  high: "bg-severity-high/15 text-severity-high border-severity-high/30",
  medium: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  low: "bg-severity-low/15 text-severity-low border-severity-low/30",
  healthy: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  error: "bg-error/15 text-error border-error/30",
  info: "bg-info/15 text-info border-info/30",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "info", className = "", ...props }, ref) => (
    <span
      ref={ref}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
);
Badge.displayName = "Badge";
