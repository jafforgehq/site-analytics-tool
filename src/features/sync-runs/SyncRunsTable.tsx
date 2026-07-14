import type { SyncRunRow } from "@/lib/api";
import { SOURCE_SHORT } from "@/lib/sources";
import { absoluteTime, relativeTime } from "@/lib/dates";
import { formatDuration, formatNumber } from "@/lib/format";
import { SyncStatusPill } from "@/components/status/SyncStatusPill";
import { Card } from "@/components/ui/card";
import { usePrivacyMode } from "@/lib/privacy";

export function SyncRunsTable({
  runs,
  hideSite = false,
  onSelect,
}: {
  runs: SyncRunRow[];
  hideSite?: boolean;
  onSelect?: (run: SyncRunRow) => void;
}) {
  const privacy = usePrivacyMode();
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Started</th>
              {!hideSite && (
                <th className="px-4 py-2.5 font-medium">Website</th>
              )}
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">Trigger</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Duration</th>
              <th className="px-3 py-2.5 text-right font-medium">Rows</th>
              <th className="px-4 py-2.5 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => onSelect?.(run)}
                className={
                  "border-b border-border last:border-0 hover:bg-muted/40" +
                  (onSelect ? " cursor-pointer" : "")
                }
              >
                <td
                  className="px-4 py-2.5"
                  title={
                    privacy.enabled ? "********" : absoluteTime(run.started_at)
                  }
                >
                  {privacy.enabled ? "********" : relativeTime(run.started_at)}
                </td>
                {!hideSite && (
                  <td className="px-4 py-2.5">
                    <div className="font-medium">
                      {privacy.maskText(
                        run.site_name,
                        `run:${run.site_id}:name`,
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {privacy.maskText(
                        run.site_domain,
                        `run:${run.site_id}:domain`,
                      )}
                    </div>
                  </td>
                )}
                <td className="px-3 py-2.5">{SOURCE_SHORT[run.source]}</td>
                <td className="px-3 py-2.5 capitalize text-muted-foreground">
                  {run.trigger_type}
                </td>
                <td className="px-3 py-2.5">
                  <SyncStatusPill status={run.status} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {privacy.enabled
                    ? `${formatNumber(
                        privacy.maskNumber(
                          run.duration_ms ?? 0,
                          `run:${run.id}:duration`,
                        ),
                      )}ms`
                    : formatDuration(run.duration_ms)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(
                    privacy.maskNumber(run.rows_written, `run:${run.id}:rows`),
                  )}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-xs text-muted-foreground">
                  {run.error_code ? (
                    <span className="text-critical">{run.error_code}</span>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
