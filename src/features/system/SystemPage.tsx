import { useState } from "react";
import { Database, Trash2 } from "lucide-react";
import { env } from "@/lib/env";
import { useDbUsage, useRunCleanup } from "@/lib/hooks";
import type { DbUsage } from "@/lib/api";
import { formatBytes, formatNumber } from "@/lib/format";
import { relativeTime, absoluteTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { usePrivacyMode } from "@/lib/privacy";

const LIMIT_BYTES = env.VITE_DB_SIZE_LIMIT_MB * 1024 * 1024;

// Tables the cleanup job prunes - labelled with their retention window so the
// page documents the policy that 0008_data_retention.sql enforces.
const RETENTION = [
  { table: "analytics_daily", window: "540 days" },
  { table: "search_daily", window: "540 days" },
  { table: "search_query_daily", window: "210 days" },
  { table: "search_page_daily", window: "210 days" },
  { table: "sync_runs", window: "120 days" },
];

export function SystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">System</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Database usage and data retention.
        </p>
      </div>
      <DatabaseUsageCard />
      <RetentionCard />
    </div>
  );
}

function DatabaseUsageCard() {
  const usage = useDbUsage();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
        <CardTitle>Database usage</CardTitle>
      </CardHeader>
      <CardContent>
        {usage.isLoading ? (
          <Skeleton className="h-40" />
        ) : usage.isError || !usage.data ? (
          <ErrorState
            title="Couldn't read database usage"
            description="The usage snapshot failed to load."
            onRetry={() => void usage.refetch()}
          />
        ) : (
          <UsageBody usage={usage.data} />
        )}
      </CardContent>
    </Card>
  );
}

function UsageBody({ usage }: { usage: DbUsage }) {
  const privacy = usePrivacyMode();
  const used = usage.database_bytes;
  const displayUsed = privacy.maskNumber(used, "system:db-used") ?? used;
  const displayLimit =
    privacy.maskNumber(LIMIT_BYTES, "system:db-limit") ?? LIMIT_BYTES;
  const ratio = LIMIT_BYTES > 0 ? used / LIMIT_BYTES : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const level =
    ratio >= 0.9 ? "critical" : ratio >= 0.7 ? "warning" : "success";
  const barColor =
    level === "critical"
      ? "bg-critical"
      : level === "warning"
        ? "bg-warning"
        : "bg-success";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {formatBytes(displayUsed)}{" "}
            <span className="text-muted-foreground">
              of {formatBytes(displayLimit)}
            </span>
          </span>
          <span
            className={cn(
              "font-semibold",
              level === "critical"
                ? "text-critical"
                : level === "warning"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            {pct}%
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${Math.max(2, pct)}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {level !== "success" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {level === "critical"
              ? "Approaching the plan limit - run a cleanup or upgrade the plan."
              : "Usage is climbing. Keep an eye on it; cleanup runs weekly."}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Table</th>
              <th className="py-2 pr-4 text-right font-medium">Size</th>
              <th className="py-2 text-right font-medium">Rows (est.)</th>
            </tr>
          </thead>
          <tbody>
            {usage.tables.map((t) => (
              <tr key={t.name} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 font-mono text-xs">{t.name}</td>
                <td className="py-2 pr-4 text-right">
                  {formatBytes(
                    privacy.maskNumber(t.total_bytes, `system:${t.name}:bytes`),
                  )}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {formatNumber(
                    privacy.maskNumber(t.row_estimate, `system:${t.name}:rows`),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        className="text-xs text-muted-foreground"
        title={privacy.enabled ? "********" : absoluteTime(usage.captured_at)}
      >
        Snapshot captured{" "}
        {privacy.enabled ? "********" : relativeTime(usage.captured_at)}.
      </p>
    </div>
  );
}

function RetentionCard() {
  const privacy = usePrivacyMode();
  const cleanup = useRunCleanup();
  const [confirming, setConfirming] = useState(false);
  const result = cleanup.data;

  const preview = () => {
    setConfirming(false);
    cleanup.mutate(true);
  };
  const runNow = () => {
    setConfirming(false);
    cleanup.mutate(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        <CardTitle>Data retention</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Old rows are pruned automatically every Sunday. You can preview or run
          it now. Deleting old metrics does not affect the dashboard's
          7/30/90-day views.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Table</th>
                <th className="py-2 pr-4 font-medium">Keeps</th>
                <th className="py-2 text-right font-medium">
                  {result ? (result.dry_run ? "Would remove" : "Removed") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map((r) => (
                <tr
                  key={r.table}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 pr-4 font-mono text-xs">{r.table}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {r.window}
                  </td>
                  <td className="py-2 text-right">
                    {result
                      ? formatNumber(
                          privacy.maskNumber(
                            result.deleted[
                              r.table as keyof typeof result.deleted
                            ],
                            `retention:${r.table}:deleted`,
                          ),
                        )
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cleanup.isError && (
          <Alert tone="error">Cleanup failed. Please try again.</Alert>
        )}
        {result && !cleanup.isError && (
          <Alert tone={result.dry_run ? "info" : "success"}>
            {result.dry_run
              ? "Preview only - nothing was deleted."
              : "Cleanup complete. Old rows removed."}
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={cleanup.isPending && cleanup.variables === true}
            onClick={preview}
          >
            Preview
          </Button>
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Permanently delete old rows?
              </span>
              <Button
                variant="danger"
                size="sm"
                loading={cleanup.isPending && cleanup.variables === false}
                onClick={runNow}
              >
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Run cleanup now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
