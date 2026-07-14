import type {
  SiteMetrics,
  SiteSearchTerms,
  SiteWithStatuses,
  SyncRunRow,
} from "@/lib/api";
import type { SiteReportRangePayload } from "@/lib/site-report-pdf";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  SyncRun,
} from "@/types/database";

export interface DemoSite {
  id: string;
  slug: string;
  name: string;
  domain: string;
  description: string;
  sessions: string;
  clicks: string;
  change: string;
  attention?: boolean;
}

export const DEMO_SITES: DemoSite[] = [
  {
    id: "demo-trail-notes",
    slug: "trail-notes",
    name: "Trail Notes",
    domain: "trail-notes.example",
    description: "An outdoor travel and route-planning publication.",
    sessions: "1,842",
    clicks: "1,162",
    change: "+32.1%",
  },
  {
    id: "demo-pantry-journal",
    slug: "pantry-journal",
    name: "Pantry Journal",
    domain: "pantry-journal.example",
    description: "A practical home cooking and recipes publication.",
    sessions: "1,304",
    clicks: "912",
    change: "+17.4%",
  },
  {
    id: "demo-weekend-atlas",
    slug: "weekend-atlas",
    name: "Weekend Atlas",
    domain: "weekend-atlas.example",
    description: "Short-break guides and local travel ideas.",
    sessions: "946",
    clicks: "731",
    change: "−8.6%",
    attention: true,
  },
  {
    id: "demo-studio-ledger",
    slug: "studio-ledger",
    name: "Studio Ledger",
    domain: "studio-ledger.example",
    description: "A creator-business and independent work publication.",
    sessions: "1,237",
    clicks: "1,037",
    change: "+6.8%",
  },
];

const DEMO_END = new Date("2026-07-12T00:00:00Z");

function dateForOffset(offset: number) {
  const date = new Date(DEMO_END);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function siteOffset(siteId: string) {
  return DEMO_SITES.findIndex((site) => site.id === siteId) * 29;
}

export function getDemoSite(slug: string | undefined) {
  return DEMO_SITES.find((site) => site.slug === slug) ?? null;
}

export function demoSiteWithStatuses(site: DemoSite): SiteWithStatuses {
  const now = "2026-07-12T04:20:00.000Z";
  const status = (source: "gsc" | "ga4" | "bing"): IntegrationStatus => ({
    site_id: site.id,
    source,
    enabled: true,
    last_attempt_at: now,
    last_success_at:
      site.attention && source === "bing" ? "2026-07-10T04:20:00.000Z" : now,
    last_status: site.attention && source === "bing" ? "partial" : "success",
    last_duration_ms: source === "gsc" ? 1450 : source === "ga4" ? 810 : 1040,
    last_rows_fetched: source === "gsc" ? 420 : source === "ga4" ? 31 : 24,
    last_rows_written: source === "gsc" ? 420 : source === "ga4" ? 31 : 24,
    consecutive_failures: 0,
    last_error_code: null,
    last_error_message: null,
    next_run_at: "2026-07-13T04:00:00.000Z",
    stale_after_hours: 36,
    updated_at: now,
  });
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    website_url: `https://${site.domain}`,
    gsc_property: `sc-domain:${site.domain}`,
    ga4_property_id: String(510_300_000 + siteOffset(site.id)),
    bing_site_url: `https://${site.domain}/`,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-07-12T04:20:00.000Z",
    statuses: [status("gsc"), status("ga4"), status("bing")],
  };
}

export function demoMetrics(site: DemoSite, days = 720): SiteMetrics {
  const offset = siteOffset(site.id);
  const analytics: AnalyticsDaily[] = [];
  const search: SearchDaily[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = days - 1 - index;
    const trend = Math.floor(day / 28) * 4;
    const swing = ((day * 17 + offset) % 41) - 20;
    const users = 98 + offset + trend + swing;
    const sessions = Math.round(users * 1.28 + ((day + offset) % 17));
    const impressions = 1880 + offset * 11 + trend * 22 + swing * 18;
    const clicks = Math.round(
      impressions * (0.044 + ((day + offset) % 9) / 1000),
    );
    const date = dateForOffset(index);
    analytics.push({
      site_id: site.id,
      metric_date: date,
      active_users: users,
      total_users: users + 18,
      sessions,
      screen_page_views: Math.round(sessions * 2.25),
      engaged_sessions: Math.round(sessions * 0.68),
      updated_at: "2026-07-12T04:20:00.000Z",
    });
    search.push({
      site_id: site.id,
      engine: "google",
      metric_date: date,
      clicks,
      impressions,
      ctr: clicks / impressions,
      average_position: 17.5 + ((day + offset) % 23) / 10,
      updated_at: "2026-07-12T04:20:00.000Z",
    });
    search.push({
      site_id: site.id,
      engine: "bing",
      metric_date: date,
      clicks: Math.round(clicks * 0.17),
      impressions: Math.round(impressions * 0.2),
      ctr: null,
      average_position: null,
      updated_at: "2026-07-12T04:20:00.000Z",
    });
  }
  return { analytics, search };
}

export function demoSearchTerms(site: DemoSite, days: number): SiteSearchTerms {
  const offset = siteOffset(site.id);
  const rows = [
    ["best weekend hikes", 128, 101, 0.057, 13.4],
    ["easy travel checklist", 94, 80, 0.049, 16.2],
    ["packing guide", 76, 83, 0.043, 18.7],
    ["local weekend ideas", 61, 55, 0.039, 22.1],
  ].map(([key, clicks, clicksPrev, ctr, position], index) => ({
    key: `${key} ${site.slug}`,
    clicks: Number(clicks) + offset + index * 3,
    clicksPrev: Number(clicksPrev) + offset,
    clicksPct:
      ((Number(clicks) + offset + index * 3) / (Number(clicksPrev) + offset) -
        1) *
      100,
    impressions: (Number(clicks) + offset) * 22,
    ctr: Number(ctr),
    position: Number(position),
  }));
  const pageRows = ["/guides", "/ideas", "/checklists", "/about"].map(
    (path, index) => ({
      ...rows[index],
      key: `https://${site.domain}${path}`,
    }),
  );
  const coverage = {
    firstDate: dateForOffset(days - 1),
    lastDate: dateForOffset(0),
    daysWithRows: days,
    rows: days * 4,
  };
  return {
    queries: rows,
    pages: pageRows,
    coverage: { queries: coverage, pages: coverage },
  };
}

export function demoSyncRuns(site: DemoSite): SyncRunRow[] {
  const sourceRows: Array<"gsc" | "ga4" | "bing"> = [
    "gsc",
    "ga4",
    "bing",
    "gsc",
    "ga4",
    "bing",
  ];
  return sourceRows.map((source, index) => {
    const isPartial = site.attention && source === "bing" && index === 2;
    const run: SyncRun = {
      id: `${site.id}-run-${index}`,
      site_id: site.id,
      source,
      trigger_type: index < 3 ? "scheduled" : "manual",
      requested_by: null,
      range_start: dateForOffset(30),
      range_end: dateForOffset(1),
      started_at: `2026-07-${String(12 - index).padStart(2, "0")}T04:20:00.000Z`,
      finished_at: `2026-07-${String(12 - index).padStart(2, "0")}T04:20:01.400Z`,
      status: isPartial ? "partial" : "success",
      rows_fetched: source === "gsc" ? 420 : source === "ga4" ? 31 : 24,
      rows_written: source === "gsc" ? 420 : source === "ga4" ? 31 : 24,
      duration_ms: source === "gsc" ? 1400 : source === "ga4" ? 810 : 1040,
      error_code: null,
      error_message: null,
      metadata: { demo: true },
    };
    return { ...run, site_name: site.name, site_domain: site.domain };
  });
}

export function demoReportRanges(site: DemoSite): SiteReportRangePayload[] {
  const metrics = demoMetrics(site);
  return ([90, 180, 360] as const).map((days) => ({
    days,
    metrics,
    terms: demoSearchTerms(site, days),
  }));
}

export function demoExportTables() {
  const siteRows = DEMO_SITES.map(demoSiteWithStatuses);
  const metrics = DEMO_SITES.flatMap((site) => demoMetrics(site, 60));
  return {
    generated_at: "2026-07-12T04:20:00.000Z",
    demo_data: true,
    tables: {
      sites: siteRows.map(({ statuses: _statuses, ...site }) => site),
      integration_status: siteRows.flatMap((site) => site.statuses),
      analytics_daily: metrics.flatMap((metric) => metric.analytics),
      search_daily: metrics.flatMap((metric) => metric.search),
      search_query_daily: DEMO_SITES.flatMap((site) =>
        demoSearchTerms(site, 30).queries.map((row) => ({
          site_id: site.id,
          metric_date: "2026-07-12",
          query: row.key,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          average_position: row.position,
        })),
      ),
      sync_runs: DEMO_SITES.flatMap(demoSyncRuns),
    },
  };
}
