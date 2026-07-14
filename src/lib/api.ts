import { subDays, format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/paginate";
import { computeInsights, type InsightsResult } from "@/lib/insights";
import { aggregateBreakdown, type TermRow } from "@/lib/search-terms";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  SearchPageDaily,
  SearchQueryDaily,
  Site,
  SyncRun,
  SyncSource,
  SyncStatus,
  TriggerType,
} from "@/types/database";

// Centralized data access. UI components never call supabase directly - they
// go through these typed functions (and the hooks that wrap them). Multi-row
// metric reads use fetchAllPages (see lib/paginate) to page past PostgREST's
// 1000-row cap rather than silently truncating the newest data.

export interface SiteWithStatuses extends Site {
  statuses: IntegrationStatus[];
}

function groupStatuses(
  statuses: IntegrationStatus[],
): Map<string, IntegrationStatus[]> {
  const map = new Map<string, IntegrationStatus[]>();
  for (const s of statuses) {
    const list = map.get(s.site_id) ?? [];
    list.push(s);
    map.set(s.site_id, list);
  }
  return map;
}

export async function getSites(): Promise<SiteWithStatuses[]> {
  const [sitesRes, statusRes] = await Promise.all([
    supabase.from("sites").select("*").order("name"),
    supabase.from("integration_status").select("*"),
  ]);
  if (sitesRes.error) throw sitesRes.error;
  if (statusRes.error) throw statusRes.error;

  const byId = groupStatuses(statusRes.data ?? []);
  return (sitesRes.data ?? []).map((site) => ({
    ...site,
    statuses: byId.get(site.id) ?? [],
  }));
}

export async function getSite(
  siteId: string,
): Promise<SiteWithStatuses | null> {
  const [siteRes, statusRes] = await Promise.all([
    supabase.from("sites").select("*").eq("id", siteId).maybeSingle(),
    supabase.from("integration_status").select("*").eq("site_id", siteId),
  ]);
  if (siteRes.error) throw siteRes.error;
  if (statusRes.error) throw statusRes.error;
  if (!siteRes.data) return null;
  return { ...siteRes.data, statuses: statusRes.data ?? [] };
}

export interface SiteMetrics {
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
}

/**
 * Fetch enough history (2× the window) so the UI can compare the current period
 * against the immediately preceding one.
 */
export async function getSiteMetrics(
  siteId: string,
  days: number,
): Promise<SiteMetrics> {
  const since = format(subDays(new Date(), days * 2), "yyyy-MM-dd");
  const [analytics, search] = await Promise.all([
    fetchAllPages<AnalyticsDaily>(() =>
      supabase
        .from("analytics_daily")
        .select("*")
        .eq("site_id", siteId)
        .gte("metric_date", since)
        .order("metric_date"),
    ),
    fetchAllPages<SearchDaily>(() =>
      supabase
        .from("search_daily")
        .select("*")
        .eq("site_id", siteId)
        .gte("metric_date", since)
        .order("metric_date"),
    ),
  ]);
  return { analytics, search };
}

export interface SiteSearchTerms {
  queries: TermRow[];
  pages: TermRow[];
  coverage: {
    queries: DateCoverage;
    pages: DateCoverage;
  };
}

export interface DateCoverage {
  firstDate: string | null;
  lastDate: string | null;
  daysWithRows: number;
  rows: number;
}

function getDateCoverage(rows: Array<{ metric_date: string }>): DateCoverage {
  if (rows.length === 0) {
    return { firstDate: null, lastDate: null, daysWithRows: 0, rows: 0 };
  }
  const dates = [...new Set(rows.map((row) => row.metric_date))].sort();
  return {
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    daysWithRows: dates.length,
    rows: rows.length,
  };
}

/** Top search queries and pages for a site over the window, with click deltas. */
export async function getSiteSearchTerms(
  siteId: string,
  days: number,
): Promise<SiteSearchTerms> {
  const since = format(subDays(new Date(), days * 2), "yyyy-MM-dd");
  type QueryRow = {
    metric_date: string;
    query: string;
    clicks: number;
    impressions: number;
    average_position: number | null;
  };
  type PageRow = {
    metric_date: string;
    page: string;
    clicks: number;
    impressions: number;
    average_position: number | null;
  };
  const [queryRows, pageRows] = await Promise.all([
    fetchAllPages<QueryRow>(() =>
      supabase
        .from("search_query_daily")
        .select("metric_date, query, clicks, impressions, average_position")
        .eq("site_id", siteId)
        .gte("metric_date", since)
        .order("metric_date"),
    ),
    fetchAllPages<PageRow>(() =>
      supabase
        .from("search_page_daily")
        .select("metric_date, page, clicks, impressions, average_position")
        .eq("site_id", siteId)
        .gte("metric_date", since)
        .order("metric_date"),
    ),
  ]);

  return {
    queries: aggregateBreakdown(
      queryRows.map((r) => ({ ...r, key: r.query })),
      days,
    ),
    pages: aggregateBreakdown(
      pageRows.map((r) => ({ ...r, key: r.page })),
      days,
    ),
    coverage: {
      queries: getDateCoverage(queryRows),
      pages: getDateCoverage(pageRows),
    },
  };
}

export async function getIntegrationStatuses(
  siteId?: string,
): Promise<IntegrationStatus[]> {
  let query = supabase.from("integration_status").select("*");
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface SyncRunFilters {
  siteId?: string;
  source?: SyncSource;
  status?: SyncStatus;
  triggerType?: TriggerType;
  since?: string; // yyyy-MM-dd
  limit?: number;
}

export interface SyncRunRow extends SyncRun {
  site_name: string;
  site_domain: string;
}

export async function getSyncRuns(
  filters: SyncRunFilters = {},
): Promise<SyncRunRow[]> {
  let query = supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.siteId) query = query.eq("site_id", filters.siteId);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.triggerType)
    query = query.eq("trigger_type", filters.triggerType);
  if (filters.since) query = query.gte("started_at", filters.since);

  const [runsRes, sitesRes] = await Promise.all([
    query,
    supabase.from("sites").select("id, name, domain"),
  ]);
  if (runsRes.error) throw runsRes.error;
  if (sitesRes.error) throw sitesRes.error;

  const sites = new Map((sitesRes.data ?? []).map((s) => [s.id, s] as const));
  return (runsRes.data ?? []).map((run) => ({
    ...run,
    site_name: sites.get(run.site_id)?.name ?? "Unknown site",
    site_domain: sites.get(run.site_id)?.domain ?? "",
  }));
}

// Manual sync -----------------------------------------------------------------
export type ManualSource = SyncSource | "all";

export interface ManualSyncOutcome {
  source: SyncSource;
  status: "success" | "partial" | "failed" | "conflict" | "skipped";
  runId?: string;
  rowsWritten?: number;
}

export class ManualSyncError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ManualSyncError";
  }
}

/**
 * Invoke the manual-sync Edge Function. The browser only sends a site id and a
 * source - the function loads the site and verifies admin + aal2 server-side.
 */
export async function invokeManualSync(
  siteId: string,
  source: ManualSource,
): Promise<ManualSyncOutcome[]> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    runs: ManualSyncOutcome[];
  }>("manual-sync", { body: { siteId, source } });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let status: number | undefined;
    let code = "error";
    let message = "Sync request failed.";
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const payload = (await ctx.clone().json()) as {
          error?: string;
          message?: string;
        };
        code = payload.error ?? code;
        message = payload.message ?? message;
      } catch {
        // non-JSON body - keep generic message
      }
    }
    throw new ManualSyncError(code, message, status);
  }

  return data?.runs ?? [];
}

// Site management -------------------------------------------------------------
export interface SiteFormValues {
  name: string;
  domain: string;
  website_url: string;
  gsc_property: string;
  ga4_property_id: string;
  bing_site_url: string;
  is_active: boolean;
}

export class SaveSiteError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "SaveSiteError";
  }
}

/** Create or update a site via the manage-sites Edge Function (admin + aal2
 * verified server-side; the browser holds no write policies). */
export async function saveSite(args: {
  action: "create" | "update";
  id?: string;
  values: SiteFormValues;
}): Promise<Site> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    site: Site;
  }>("manage-sites", {
    body: { action: args.action, id: args.id, site: args.values },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    let status: number | undefined;
    let code = "error";
    let message = "Could not save the site.";
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const payload = (await ctx.clone().json()) as {
          error?: string;
          message?: string;
        };
        code = payload.error ?? code;
        message = payload.message ?? message;
      } catch {
        // keep generic message
      }
    }
    throw new SaveSiteError(code, message, status);
  }

  return data!.site;
}

/** Delete a site (cascades to its metrics, history, and integration status). */
export async function deleteSite(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke("manage-sites", {
    body: { action: "delete", id },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let status: number | undefined;
    let message = "Could not delete the site.";
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const payload = (await ctx.clone().json()) as { message?: string };
        message = payload.message ?? message;
      } catch {
        // keep generic message
      }
    }
    throw new SaveSiteError("delete_failed", message, status);
  }
}

// Portfolio overview ----------------------------------------------------------
/**
 * The full overview payload: the computed insights model plus the per-site
 * integration status list the health table needs. Both are derived from the
 * same fetch so the Overview page only makes one round trip.
 */
export interface InsightsWithSites extends InsightsResult {
  sitesWithStatuses: SiteWithStatuses[];
}

/**
 * Load every site's metrics for the window and compute the full insights model
 * (portfolio KPIs, movers, opportunities, anomalies, coverage, action items),
 * plus the site+status list for the integration-health table.
 */
export async function getInsights(days: number): Promise<InsightsWithSites> {
  const since = format(subDays(new Date(), days * 2), "yyyy-MM-dd");
  const [sitesRes, statusRes, analytics, search] = await Promise.all([
    supabase.from("sites").select("*").order("name"),
    supabase.from("integration_status").select("*"),
    fetchAllPages<AnalyticsDaily>(() =>
      supabase
        .from("analytics_daily")
        .select("*")
        .gte("metric_date", since)
        .order("metric_date"),
    ),
    fetchAllPages<SearchDaily>(() =>
      supabase
        .from("search_daily")
        .select("*")
        .gte("metric_date", since)
        .order("metric_date"),
    ),
  ]);
  if (sitesRes.error) throw sitesRes.error;
  if (statusRes.error) throw statusRes.error;

  const sites = sitesRes.data ?? [];
  const statuses = statusRes.data ?? [];
  const byId = groupStatuses(statuses);

  return {
    ...computeInsights({ sites, statuses, analytics, search, days }),
    sitesWithStatuses: sites.map((site) => ({
      ...site,
      statuses: byId.get(site.id) ?? [],
    })),
  };
}

// Full data export ------------------------------------------------------------
export interface PortfolioDataExport {
  generated_at: string;
  schema_version: 1;
  retention: {
    analytics_daily: "540 days";
    search_daily: "540 days";
    search_query_daily: "210 days";
    search_page_daily: "210 days";
    sync_runs: "120 days";
  };
  row_counts: Record<keyof PortfolioDataExport["tables"], number>;
  tables: {
    sites: Site[];
    integration_status: IntegrationStatus[];
    analytics_daily: AnalyticsDaily[];
    search_daily: SearchDaily[];
    search_query_daily: SearchQueryDaily[];
    search_page_daily: SearchPageDaily[];
    sync_runs: SyncRun[];
  };
}

/** Export every readable portfolio table as an agent-friendly JSON bundle. */
export async function getPortfolioDataExport(): Promise<PortfolioDataExport> {
  const [
    sitesRes,
    statusRes,
    analyticsDaily,
    searchDaily,
    searchQueryDaily,
    searchPageDaily,
    syncRuns,
  ] = await Promise.all([
    supabase.from("sites").select("*").order("name"),
    supabase.from("integration_status").select("*").order("site_id"),
    fetchAllPages<AnalyticsDaily>(() =>
      supabase
        .from("analytics_daily")
        .select("*")
        .order("site_id")
        .order("metric_date"),
    ),
    fetchAllPages<SearchDaily>(() =>
      supabase
        .from("search_daily")
        .select("*")
        .order("site_id")
        .order("engine")
        .order("metric_date"),
    ),
    fetchAllPages<SearchQueryDaily>(() =>
      supabase
        .from("search_query_daily")
        .select("*")
        .order("site_id")
        .order("engine")
        .order("metric_date"),
    ),
    fetchAllPages<SearchPageDaily>(() =>
      supabase
        .from("search_page_daily")
        .select("*")
        .order("site_id")
        .order("engine")
        .order("metric_date"),
    ),
    fetchAllPages<SyncRun>(() =>
      supabase
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false }),
    ),
  ]);

  if (sitesRes.error) throw sitesRes.error;
  if (statusRes.error) throw statusRes.error;

  const tables = {
    sites: sitesRes.data ?? [],
    integration_status: statusRes.data ?? [],
    analytics_daily: analyticsDaily,
    search_daily: searchDaily,
    search_query_daily: searchQueryDaily,
    search_page_daily: searchPageDaily,
    sync_runs: syncRuns,
  };

  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    retention: {
      analytics_daily: "540 days",
      search_daily: "540 days",
      search_query_daily: "210 days",
      search_page_daily: "210 days",
      sync_runs: "120 days",
    },
    row_counts: Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.length]),
    ) as PortfolioDataExport["row_counts"],
    tables,
  };
}

// Database usage & maintenance ------------------------------------------------
export interface DbUsageTable {
  name: string;
  total_bytes: number;
  row_estimate: number;
}

export interface DbUsage {
  captured_at: string;
  database_bytes: number;
  tables: DbUsageTable[];
}

/** Database size + per-table sizes via the admin-guarded get_db_usage() RPC. */
export async function getDbUsage(): Promise<DbUsage> {
  const { data, error } = await supabase.rpc("get_db_usage");
  if (error) throw error;
  return data as unknown as DbUsage;
}

export interface CleanupResult {
  dry_run: boolean;
  executed_at: string;
  cutoffs: { daily: string; search_terms: string; sync_runs: string };
  deleted: {
    analytics_daily: number;
    search_daily: number;
    search_query_daily: number;
    search_page_daily: number;
    sync_runs: number;
  };
}

/**
 * Run (or, with dryRun, preview) the retention cleanup via the admin-guarded
 * run_cleanup() RPC. A dry run only counts the rows that would be removed.
 */
export async function runCleanup(dryRun: boolean): Promise<CleanupResult> {
  const { data, error } = await supabase.rpc("run_cleanup", {
    p_dry_run: dryRun,
  });
  if (error) throw error;
  return data as unknown as CleanupResult;
}
