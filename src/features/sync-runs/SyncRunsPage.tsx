import { useState } from "react";
import { X } from "lucide-react";
import { useSites, useSyncRuns } from "@/lib/hooks";
import type { SyncRunRow, SyncRunFilters } from "@/lib/api";
import { SOURCES, SOURCE_LABEL } from "@/lib/sources";
import { absoluteTime } from "@/lib/dates";
import { formatDuration, formatNumber } from "@/lib/format";
import type { SyncSource, SyncStatus, TriggerType } from "@/types/database";
import { SyncRunsTable } from "@/features/sync-runs/SyncRunsTable";
import { SyncStatusPill } from "@/components/status/SyncStatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePrivacyMode } from "@/lib/privacy";

const STATUSES: SyncStatus[] = ["success", "partial", "failed", "running"];
const TRIGGERS: TriggerType[] = ["scheduled", "manual", "backfill"];

export function SyncRunsPage() {
  const privacy = usePrivacyMode();
  const { data: sites } = useSites();
  const [filters, setFilters] = useState<SyncRunFilters>({ limit: 200 });
  const [selected, setSelected] = useState<SyncRunRow | null>(null);

  const { data: runs, isLoading, isError, refetch } = useSyncRuns(filters);

  const update = (patch: Partial<SyncRunFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Sync history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every sync attempt across the portfolio.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          label="Website"
          value={filters.siteId ?? ""}
          onChange={(v) => update({ siteId: v || undefined })}
          options={[
            { value: "", label: "All websites" },
            ...(sites ?? []).map((s) => ({
              value: s.id,
              label: privacy.maskText(s.name, `sync-filter:${s.id}:name`),
            })),
          ]}
        />
        <Select
          label="Source"
          value={filters.source ?? ""}
          onChange={(v) => update({ source: (v || undefined) as SyncSource })}
          options={[
            { value: "", label: "All sources" },
            ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
          ]}
        />
        <Select
          label="Status"
          value={filters.status ?? ""}
          onChange={(v) => update({ status: (v || undefined) as SyncStatus })}
          options={[
            { value: "", label: "All statuses" },
            ...STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <Select
          label="Trigger"
          value={filters.triggerType ?? ""}
          onChange={(v) =>
            update({ triggerType: (v || undefined) as TriggerType })
          }
          options={[
            { value: "", label: "All triggers" },
            ...TRIGGERS.map((t) => ({ value: t, label: t })),
          ]}
        />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Since
          <input
            type="date"
            value={filters.since ?? ""}
            onChange={(e) => update({ since: e.target.value || undefined })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
      </div>

      {isLoading && <Skeleton className="h-64" />}
      {isError && <ErrorState onRetry={() => void refetch()} />}
      {runs && runs.length === 0 && (
        <EmptyState
          title="No sync runs match these filters"
          description="Adjust the filters above, or run a sync to generate history."
        />
      )}
      {runs && runs.length > 0 && (
        <SyncRunsTable runs={runs} onSelect={setSelected} />
      )}

      {selected && (
        <RunDetailPanel run={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm capitalize text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RunDetailPanel({
  run,
  onClose,
}: {
  run: SyncRunRow;
  onClose: () => void;
}) {
  const privacy = usePrivacyMode();
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Sync run detail"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              {privacy.maskText(
                run.site_name,
                `run-detail:${run.site_id}:name`,
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              {SOURCE_LABEL[run.source]} · {run.trigger_type}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <Detail
            label="Status"
            value={<SyncStatusPill status={run.status} />}
          />
          <Detail
            label="Started"
            value={privacy.enabled ? "********" : absoluteTime(run.started_at)}
          />
          <Detail
            label="Finished"
            value={privacy.enabled ? "********" : absoluteTime(run.finished_at)}
          />
          <Detail
            label="Requested range"
            value={
              privacy.enabled
                ? "********"
                : run.range_start && run.range_end
                  ? `${run.range_start} → ${run.range_end}`
                  : "-"
            }
          />
          <Detail
            label="Duration"
            value={
              privacy.enabled
                ? `${formatNumber(
                    privacy.maskNumber(
                      run.duration_ms ?? 0,
                      `run-detail:${run.id}:duration`,
                    ),
                  )}ms`
                : formatDuration(run.duration_ms)
            }
          />
          <Detail
            label="Rows fetched"
            value={formatNumber(
              privacy.maskNumber(
                run.rows_fetched,
                `run-detail:${run.id}:rows-fetched`,
              ),
            )}
          />
          <Detail
            label="Rows written"
            value={formatNumber(
              privacy.maskNumber(
                run.rows_written,
                `run-detail:${run.id}:rows-written`,
              ),
            )}
          />
          <Detail label="Error code" value={run.error_code ?? "-"} />
        </div>

        {run.error_message && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">
              Error message
            </p>
            <p className="mt-1 rounded-md border border-critical/30 bg-critical/5 p-2 text-xs text-foreground">
              {privacy.maskText(
                run.error_message,
                `run-detail:${run.id}:error`,
              )}
            </p>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Metadata</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
            {privacy.enabled
              ? "********"
              : JSON.stringify(run.metadata, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
