import { Activity } from "lucide-react";
import { useUptimeSummaries } from "@/lib/hooks";
import { formatDuration } from "@/lib/format";
import { relativeTime } from "@/lib/dates";
import { usePrivacyMode } from "@/lib/privacy";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Availability of the site's public URL from the hourly scheduled probe.
 * Renders nothing until the first check exists (the feature is silent until
 * the cron has run).
 */
export function UptimeCard({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  const uptimeQuery = useUptimeSummaries();
  const summary = uptimeQuery.data?.get(siteId);
  if (!summary) return null;

  const upPct = summary.upPct;
  const healthy = summary.lastOk === true;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Activity className="h-4 w-4" aria-hidden />
            Uptime · 7 days
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              healthy
                ? "border-success/30 bg-success/10 text-success"
                : "border-critical/30 bg-critical/10 text-critical",
            )}
          >
            {healthy ? "Up" : "Down"}
          </span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {upPct == null ? "-" : `${upPct.toFixed(upPct === 100 ? 0 : 1)}%`}
        </p>
        {/* Most recent checks, oldest → newest */}
        <div className="flex h-4 items-end gap-px">
          {[...summary.recent].reverse().map((check) => (
            <span
              key={check.checked_at}
              title={
                privacy.enabled
                  ? undefined
                  : `${check.ok ? "ok" : (check.error ?? "down")} · ${
                      check.latency_ms != null
                        ? formatDuration(check.latency_ms)
                        : "-"
                    }`
              }
              className={cn(
                "w-1 flex-1 rounded-sm",
                check.ok ? "bg-success/70" : "bg-critical",
              )}
              style={{ height: check.ok ? "100%" : "60%" }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Last check{" "}
          {privacy.enabled ? "********" : relativeTime(summary.lastCheckAt)}
          {summary.lastLatencyMs != null && !privacy.enabled
            ? ` · ${formatDuration(summary.lastLatencyMs)}`
            : ""}
          {summary.lastStatusCode != null && !privacy.enabled
            ? ` · HTTP ${summary.lastStatusCode}`
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
