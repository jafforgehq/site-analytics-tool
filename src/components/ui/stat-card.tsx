import { type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { changeDirection, formatPercentChange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Period-over-period delta. A drop is not inherently "bad" (e.g. lower average
 * position is good), so callers pass `goodWhenDown` to flip the coloring. */
export function MetricDelta({
  change,
  goodWhenDown = false,
  compact = false,
}: {
  change: number | null;
  goodWhenDown?: boolean;
  compact?: boolean;
}) {
  const privacy = usePrivacyMode();
  const displayChange = privacy.enabled
    ? privacy.maskNumber(change, `delta:${change}:${goodWhenDown}:${compact}`, {
        min: -85,
        max: 140,
        decimals: 1,
      })
    : change;
  const dir = changeDirection(displayChange);
  if (dir === "none") {
    return (
      <span className="text-muted-foreground">
        {compact ? "-" : "- vs prev."}
      </span>
    );
  }
  const Icon =
    dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const isGood =
    dir === "flat"
      ? null
      : (dir === "up" && !goodWhenDown) || (dir === "down" && goodWhenDown);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        isGood === null
          ? "text-muted-foreground"
          : isGood
            ? "text-success"
            : "text-critical",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {formatPercentChange(displayChange)}
      {!compact && <span className="text-muted-foreground"> vs prev.</span>}
    </span>
  );
}
