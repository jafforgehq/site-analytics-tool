import type { SupabaseClient } from "./database.ts";
import { normalizeError } from "./errors.ts";
import type { SyncSource } from "./validate.ts";

export interface SiteRow {
  id: string;
  name: string;
  domain: string;
  gsc_property: string | null;
  ga4_property_id: string | null;
  bing_site_url: string | null;
}

export interface SyncContext {
  admin: SupabaseClient;
  site: SiteRow;
  source: SyncSource;
  rangeStart?: string;
  rangeEnd?: string;
}

export interface SyncResult {
  rowsFetched: number;
  rowsWritten: number;
  partial?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  metadata?: Record<string, unknown>;
}

export type SyncAdapter = (ctx: SyncContext) => Promise<SyncResult>;

export interface RunOutcome {
  source: SyncSource;
  status: "success" | "partial" | "failed" | "conflict" | "skipped";
  runId?: string;
  rowsWritten?: number;
  reason?: string;
}

interface RunArgs {
  admin: SupabaseClient;
  site: SiteRow;
  source: SyncSource;
  triggerType: "scheduled" | "manual" | "backfill";
  requestedBy?: string;
  adapter: SyncAdapter;
  rangeStart?: string;
  rangeEnd?: string;
}

/**
 * The single sync lifecycle every integration goes through (brief §13):
 * claim a running row (409 on conflict) → mark the integration running → run
 * the adapter → finalize the run and integration_status on success/partial or
 * failure. A failed external call NEVER deletes existing metrics and NEVER
 * overwrites last_success_at.
 */
export async function runIntegrationSync(args: RunArgs): Promise<RunOutcome> {
  const { admin, site, source, triggerType, requestedBy, adapter } = args;

  // Integration must exist and be enabled.
  const { data: integration } = await admin
    .from("integration_status")
    .select("consecutive_failures, enabled")
    .eq("site_id", site.id)
    .eq("source", source)
    .maybeSingle();

  if (!integration || !integration.enabled) {
    return { source, status: "skipped", reason: "disabled" };
  }

  // Claim the run. The partial unique index rejects a second concurrent run.
  const { data: run, error: insertError } = await admin
    .from("sync_runs")
    .insert({
      site_id: site.id,
      source,
      trigger_type: triggerType,
      requested_by: requestedBy ?? null,
      range_start: args.rangeStart ?? null,
      range_end: args.rangeEnd ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { source, status: "conflict" };
    }
    throw insertError;
  }

  const runId = run.id as string;
  const startedAt = Date.now();

  await admin
    .from("integration_status")
    .update({
      last_attempt_at: new Date().toISOString(),
      last_status: "running",
    })
    .eq("site_id", site.id)
    .eq("source", source);

  try {
    const result = await adapter({
      admin,
      site,
      source,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });

    const status = result.partial ? "partial" : "success";
    const durationMs = Date.now() - startedAt;
    const finishedAt = new Date().toISOString();

    await admin
      .from("sync_runs")
      .update({
        status,
        finished_at: finishedAt,
        rows_fetched: result.rowsFetched,
        rows_written: result.rowsWritten,
        duration_ms: durationMs,
        range_start: result.rangeStart ?? args.rangeStart ?? null,
        range_end: result.rangeEnd ?? args.rangeEnd ?? null,
        metadata: result.metadata ?? {},
      })
      .eq("id", runId);

    // Some data was stored → reset the failure streak and bump last success.
    await admin
      .from("integration_status")
      .update({
        last_status: status,
        last_success_at: finishedAt,
        last_duration_ms: durationMs,
        last_rows_fetched: result.rowsFetched,
        last_rows_written: result.rowsWritten,
        consecutive_failures: 0,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("site_id", site.id)
      .eq("source", source);

    return {
      source,
      status,
      runId,
      rowsWritten: result.rowsWritten,
    };
  } catch (err) {
    const normalized = normalizeError(err);
    const durationMs = Date.now() - startedAt;

    await admin
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_code: normalized.code,
        error_message: normalized.message,
        metadata: normalized.status ? { httpStatus: normalized.status } : {},
      })
      .eq("id", runId);

    // last_success_at is intentionally left untouched.
    await admin
      .from("integration_status")
      .update({
        last_status: "failed",
        last_duration_ms: durationMs,
        consecutive_failures: (integration.consecutive_failures ?? 0) + 1,
        last_error_code: normalized.code,
        last_error_message: normalized.message,
      })
      .eq("site_id", site.id)
      .eq("source", source);

    return { source, status: "failed", runId };
  }
}
