import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { SyncStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const STYLES: Record<
  SyncStatus,
  { Icon: LucideIcon; chip: string; spin?: boolean }
> = {
  success: {
    Icon: CheckCircle2,
    chip: "border-success/30 bg-success/10 text-success",
  },
  partial: {
    Icon: AlertTriangle,
    chip: "border-warning/30 bg-warning/10 text-warning",
  },
  failed: {
    Icon: XCircle,
    chip: "border-critical/30 bg-critical/10 text-critical",
  },
  running: {
    Icon: Loader2,
    chip: "border-border bg-muted text-muted-foreground",
    spin: true,
  },
};

export function SyncStatusPill({ status }: { status: SyncStatus }) {
  const { Icon, chip, spin } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        chip,
      )}
    >
      <Icon className={cn("h-3 w-3", spin && "animate-spin")} aria-hidden />
      {status}
    </span>
  );
}
