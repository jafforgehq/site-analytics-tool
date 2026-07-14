import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  Clock,
  type LucideIcon,
} from "lucide-react";
import type { HealthLevel, IntegrationHealth } from "@/lib/health";
import { cn } from "@/lib/utils";

const STYLES: Record<
  HealthLevel,
  { Icon: LucideIcon; text: string; chip: string }
> = {
  healthy: {
    Icon: CheckCircle2,
    text: "text-success",
    chip: "border-success/30 bg-success/10 text-success",
  },
  warning: {
    Icon: AlertTriangle,
    text: "text-warning",
    chip: "border-warning/30 bg-warning/10 text-warning",
  },
  critical: {
    Icon: XCircle,
    text: "text-critical",
    chip: "border-critical/30 bg-critical/10 text-critical",
  },
  pending: {
    Icon: Clock,
    text: "text-muted-foreground",
    chip: "border-primary/30 bg-primary/10 text-primary",
  },
  disabled: {
    Icon: MinusCircle,
    text: "text-muted-foreground",
    chip: "border-border bg-muted text-muted-foreground",
  },
};

/** Full chip with icon + label. Both icon and text encode status (not color
 * alone), satisfying the accessibility requirement. */
export function HealthBadge({
  health,
  className,
}: {
  health: IntegrationHealth;
  className?: string;
}) {
  const { Icon, chip } = STYLES[health.level];
  return (
    <span
      title={health.reason}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        chip,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {health.title}
    </span>
  );
}

/** Compact icon-only indicator for dense table cells. The accessible name and
 * tooltip carry the meaning. */
export function HealthIcon({
  health,
  label,
}: {
  health: IntegrationHealth;
  label: string;
}) {
  const { Icon, text } = STYLES[health.level];
  return (
    <span
      title={`${label}: ${health.title} - ${health.reason}`}
      className={cn("inline-flex", text)}
      role="img"
      aria-label={`${label}: ${health.title}. ${health.reason}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
