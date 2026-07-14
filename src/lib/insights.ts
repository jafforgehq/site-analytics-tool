import { computeHealth } from "@/lib/health";
import {
  percentageChange,
  splitPeriods,
  sumBy,
  weightedAveragePosition,
  weightedCtr,
} from "@/lib/metrics";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  Site,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Delta {
  current: number;
  previous: number;
  pct: number | null;
}

export type InsightSeverity = "critical" | "warning" | "positive" | "info";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action?: string;
  siteId?: string;
}

export interface Anomaly {
  date: string;
  value: number;
  mean: number;
  z: number;
}

export interface SiteRow {
  siteId: string;
  siteName: string;
  domain: string;
  anomaly: Anomaly | null;
  sessions: Delta;
  users: Delta;
  pageViews: Delta;
  engagedSessions: Delta;
  clicks: Delta;
  impressions: Delta;
  ctr: number | null;
  ctrPrev: number | null;
  position: number | null;
  engagementRate: number | null;
  pagesPerSession: number | null;
  bingClicks: number;
  googleClicks: number;
  sparkline: number[];
}

export interface CoverageRow {
  siteId: string;
  siteName: string;
  source: "gsc" | "ga4" | "bing";
  lastDataDate: string | null;
  staleDays: number | null;
  hasGap: boolean;
}

export interface InsightsResult {
  days: number;
  health: {
    activeSites: number;
    enabledIntegrations: number;
    healthy: number;
    warning: number;
    critical: number;
    pending: number;
    attention: number;
  };
  kpis: {
    clicks: Delta;
    impressions: Delta;
    users: Delta;
    sessions: Delta;
  };
  engineSplit: { google: number; bing: number };
  sites: SiteRow[];
  movers: { gainers: SiteRow[]; decliners: SiteRow[] };
  coverage: CoverageRow[];
  insights: Insight[];
}

interface ComputeInput {
  sites: Site[];
  statuses: IntegrationStatus[];
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
  days: number;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function delta(current: number, previous: number): Delta {
  return { current, previous, pct: percentageChange(current, previous) };
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
export function computeInsights(input: ComputeInput): InsightsResult {
  const now = input.now ?? new Date();
  const { days } = input;
  const activeSites = input.sites.filter((s) => s.is_active);

  const analyticsBySite = groupBy(input.analytics, (r) => r.site_id);
  const searchBySite = groupBy(input.search, (r) => r.site_id);
  const statusBySite = groupBy(input.statuses, (r) => r.site_id);

  const siteRows: SiteRow[] = activeSites.map((site) => {
    const analytics = analyticsBySite.get(site.id) ?? [];
    const search = searchBySite.get(site.id) ?? [];
    const google = search.filter((r) => r.engine === "google");
    const bing = search.filter((r) => r.engine === "bing");

    const a = splitPeriods(analytics, days);
    const g = splitPeriods(google, days);
    const b = splitPeriods(bing, days);

    const sessionsCur = sumBy(a.current, (r) => r.sessions);
    const sessionsPrev = sumBy(a.previous, (r) => r.sessions);
    const usersCur = sumBy(a.current, (r) => r.active_users);
    const usersPrev = sumBy(a.previous, (r) => r.active_users);
    const pvCur = sumBy(a.current, (r) => r.screen_page_views);
    const pvPrev = sumBy(a.previous, (r) => r.screen_page_views);
    const engCur = sumBy(a.current, (r) => r.engaged_sessions);
    const engPrev = sumBy(a.previous, (r) => r.engaged_sessions);

    const gClicksCur = sumBy(g.current, (r) => r.clicks);
    const gClicksPrev = sumBy(g.previous, (r) => r.clicks);
    const gImprCur = sumBy(g.current, (r) => r.impressions);
    const gImprPrev = sumBy(g.previous, (r) => r.impressions);
    const bClicksCur = sumBy(b.current, (r) => r.clicks);
    const bImprCur = sumBy(b.current, (r) => r.impressions);

    const clicksCur = gClicksCur + bClicksCur;
    const clicksPrev = gClicksPrev + sumBy(b.previous, (r) => r.clicks);
    const imprCur = gImprCur + bImprCur;
    const imprPrev = gImprPrev + sumBy(b.previous, (r) => r.impressions);

    // sparkline = daily sessions across the current window (fallback to clicks)
    const sparkSource =
      a.current.length > 0
        ? a.current.map((r) => r.sessions)
        : g.current.map((r) => r.clicks);

    return {
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      anomaly: detectAnomaly(a.current),
      sessions: delta(sessionsCur, sessionsPrev),
      users: delta(usersCur, usersPrev),
      pageViews: delta(pvCur, pvPrev),
      engagedSessions: delta(engCur, engPrev),
      clicks: delta(clicksCur, clicksPrev),
      impressions: delta(imprCur, imprPrev),
      ctr: weightedCtr(gClicksCur, gImprCur),
      ctrPrev: weightedCtr(gClicksPrev, gImprPrev),
      position: weightedAveragePosition(g.current),
      engagementRate: sessionsCur > 0 ? engCur / sessionsCur : null,
      pagesPerSession: sessionsCur > 0 ? pvCur / sessionsCur : null,
      bingClicks: bClicksCur,
      googleClicks: gClicksCur,
      sparkline: sparkSource,
    };
  });

  // Portfolio KPIs
  const kpis = {
    clicks: delta(
      sumBy(siteRows, (s) => s.clicks.current),
      sumBy(siteRows, (s) => s.clicks.previous),
    ),
    impressions: delta(
      sumBy(siteRows, (s) => s.impressions.current),
      sumBy(siteRows, (s) => s.impressions.previous),
    ),
    users: delta(
      sumBy(siteRows, (s) => s.users.current),
      sumBy(siteRows, (s) => s.users.previous),
    ),
    sessions: delta(
      sumBy(siteRows, (s) => s.sessions.current),
      sumBy(siteRows, (s) => s.sessions.previous),
    ),
  };

  const engineSplit = {
    google: sumBy(siteRows, (s) => s.googleClicks),
    bing: sumBy(siteRows, (s) => s.bingClicks),
  };

  // Top movers by clicks % change (need meaningful volume)
  const moverPool = siteRows.filter(
    (s) => s.clicks.pct !== null && s.clicks.current + s.clicks.previous >= 20,
  );
  const byPct = [...moverPool].sort(
    (x, y) => (y.clicks.pct ?? 0) - (x.clicks.pct ?? 0),
  );
  const gainers = byPct.filter((s) => (s.clicks.pct ?? 0) > 0).slice(0, 3);
  const decliners = byPct
    .filter((s) => (s.clicks.pct ?? 0) < 0)
    .slice(-3)
    .reverse();

  // Health roll-up
  const health = rollUpHealth(activeSites, statusBySite, now);

  // Coverage
  const coverage = computeCoverage(
    activeSites,
    statusBySite,
    analyticsBySite,
    searchBySite,
    now,
  );

  const insights = buildInsights({
    siteRows,
    gainers,
    decliners,
    coverage,
    statusBySite,
    activeSites,
    engineSplit,
    now,
  });

  return {
    days,
    health,
    kpis,
    engineSplit,
    sites: siteRows,
    movers: { gainers, decliners },
    coverage,
    insights,
  };
}

function rollUpHealth(
  activeSites: Site[],
  statusBySite: Map<string, IntegrationStatus[]>,
  now: Date,
) {
  let enabled = 0;
  let healthy = 0;
  let warning = 0;
  let critical = 0;
  let pending = 0;
  for (const site of activeSites) {
    for (const status of statusBySite.get(site.id) ?? []) {
      if (status.enabled) enabled += 1;
      const level = computeHealth(status, now).level;
      if (level === "healthy") healthy += 1;
      else if (level === "warning") warning += 1;
      else if (level === "critical") critical += 1;
      else if (level === "pending") pending += 1;
    }
  }
  return {
    activeSites: activeSites.length,
    enabledIntegrations: enabled,
    healthy,
    warning,
    critical,
    pending,
    attention: warning + critical,
  };
}

function lastDate(rows: { metric_date: string }[]): string | null {
  let max: string | null = null;
  for (const r of rows) if (!max || r.metric_date > max) max = r.metric_date;
  return max;
}

function daysBetween(fromIso: string, now: Date): number {
  const then = new Date(`${fromIso}T00:00:00Z`).getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}

function computeCoverage(
  activeSites: Site[],
  statusBySite: Map<string, IntegrationStatus[]>,
  analyticsBySite: Map<string, AnalyticsDaily[]>,
  searchBySite: Map<string, SearchDaily[]>,
  now: Date,
): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const site of activeSites) {
    const statuses = statusBySite.get(site.id) ?? [];
    const search = searchBySite.get(site.id) ?? [];
    for (const status of statuses) {
      if (!status.enabled) continue;
      let last: string | null = null;
      if (status.source === "ga4") {
        last = lastDate(analyticsBySite.get(site.id) ?? []);
      } else {
        const engine = status.source === "gsc" ? "google" : "bing";
        last = lastDate(search.filter((r) => r.engine === engine));
      }
      // Providers lag ~2 days; flag as a gap only beyond 3 days.
      const staleDays = last ? daysBetween(last, now) : null;
      rows.push({
        siteId: site.id,
        siteName: site.name,
        source: status.source,
        lastDataDate: last,
        staleDays,
        hasGap: last == null || (staleDays ?? 0) > 3,
      });
    }
  }
  return rows;
}

interface BuildInput {
  siteRows: SiteRow[];
  gainers: SiteRow[];
  decliners: SiteRow[];
  coverage: CoverageRow[];
  statusBySite: Map<string, IntegrationStatus[]>;
  activeSites: Site[];
  engineSplit: { google: number; bing: number };
  now: Date;
}

function buildInsights(input: BuildInput): Insight[] {
  const out: Insight[] = [];

  // Failing integrations (critical/warning)
  for (const site of input.activeSites) {
    for (const status of input.statusBySite.get(site.id) ?? []) {
      const health = computeHealth(status, input.now);
      if (health.level === "critical") {
        out.push({
          id: `health-${site.id}-${status.source}`,
          severity: "critical",
          title: `${site.name}: ${status.source.toUpperCase()} ${health.title.toLowerCase()}`,
          detail: health.reason,
          action: "Open Sync history and check the error / credentials.",
          siteId: site.id,
        });
      }
    }
  }

  // Big decliners
  for (const s of input.decliners) {
    const pct = s.clicks.pct ?? 0;
    if (pct <= -20) {
      out.push({
        id: `decline-${s.siteId}`,
        severity: "warning",
        title: `${s.siteName}: clicks down ${Math.abs(Math.round(pct))}%`,
        detail: `Search clicks fell from ${s.clicks.previous.toLocaleString()} to ${s.clicks.current.toLocaleString()} vs the previous period.`,
        action: "Check for ranking drops, deindexed pages, or seasonality.",
        siteId: s.siteId,
      });
    }
  }

  // Big gainers
  for (const s of input.gainers) {
    const pct = s.clicks.pct ?? 0;
    if (pct >= 25) {
      out.push({
        id: `gain-${s.siteId}`,
        severity: "positive",
        title: `${s.siteName}: clicks up ${Math.round(pct)}%`,
        detail: `Search clicks rose from ${s.clicks.previous.toLocaleString()} to ${s.clicks.current.toLocaleString()}.`,
        action: "Identify the winning pages/queries and double down.",
        siteId: s.siteId,
      });
    }
  }

  // CTR opportunities vs portfolio benchmark
  const benchCtr = portfolioCtr(input.siteRows);
  if (benchCtr != null) {
    for (const s of input.siteRows) {
      if (
        s.ctr != null &&
        s.impressions.current >= 1000 &&
        s.ctr < benchCtr * 0.6
      ) {
        out.push({
          id: `ctr-${s.siteId}`,
          severity: "info",
          title: `${s.siteName}: low CTR (${(s.ctr * 100).toFixed(1)}%)`,
          detail: `${s.impressions.current.toLocaleString()} impressions but CTR is well below the portfolio average of ${(benchCtr * 100).toFixed(1)}%.`,
          action: "Sharpen titles & meta descriptions to earn more clicks.",
          siteId: s.siteId,
        });
      }
    }
  }

  // Ranking opportunities
  for (const s of input.siteRows) {
    if (
      s.position != null &&
      s.position > 15 &&
      s.impressions.current >= 1000
    ) {
      out.push({
        id: `pos-${s.siteId}`,
        severity: "info",
        title: `${s.siteName}: avg position ${s.position.toFixed(1)}`,
        detail: `Ranking on page 2+ despite ${s.impressions.current.toLocaleString()} impressions.`,
        action: "Strengthen the top pages to push onto page 1.",
        siteId: s.siteId,
      });
    }
  }

  // Anomalous days
  for (const s of input.siteRows) {
    if (s.anomaly) {
      const dir = s.anomaly.z > 0 ? "spike" : "drop";
      out.push({
        id: `anomaly-${s.siteId}`,
        severity: s.anomaly.z > 0 ? "info" : "warning",
        title: `${s.siteName}: unusual ${dir} on ${s.anomaly.date}`,
        detail: `${Math.round(s.anomaly.value).toLocaleString()} sessions that day vs a ~${Math.round(s.anomaly.mean).toLocaleString()} average for the period.`,
        action:
          s.anomaly.z > 0
            ? "Find the traffic source - a feature, link, or campaign worth repeating."
            : "Check for an outage, tracking gap, or ranking loss that day.",
        siteId: s.siteId,
      });
    }
  }

  // Coverage gaps
  for (const c of input.coverage) {
    if (c.hasGap) {
      out.push({
        id: `cov-${c.siteId}-${c.source}`,
        severity: "warning",
        title: `${c.siteName}: ${c.source.toUpperCase()} data is stale`,
        detail: c.lastDataDate
          ? `No new ${c.source.toUpperCase()} data since ${c.lastDataDate} (${c.staleDays} days).`
          : `No ${c.source.toUpperCase()} data on record yet.`,
        action: "Run a manual sync and verify the property configuration.",
        siteId: c.siteId,
      });
    }
  }

  // Dedupe by id, sort by severity then title
  const seen = new Set<string>();
  const deduped = out.filter((i) =>
    seen.has(i.id) ? false : (seen.add(i.id), true),
  );
  deduped.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.title.localeCompare(b.title),
  );
  return deduped.slice(0, 14);
}

/** Flag the single most extreme day in a session series (|z| > 3). */
function detectAnomaly(rows: AnalyticsDaily[]): Anomaly | null {
  if (rows.length < 8) return null;
  const vals = rows.map((r) => r.sessions);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;

  let best: Anomaly | null = null;
  for (const r of rows) {
    const z = (r.sessions - mean) / std;
    if (Math.abs(z) > (best ? Math.abs(best.z) : 3)) {
      best = { date: r.metric_date, value: r.sessions, mean, z };
    }
  }
  return best;
}

function portfolioCtr(rows: SiteRow[]): number | null {
  const clicks = sumBy(rows, (s) => s.googleClicks);
  const impr = sumBy(rows, (s) => s.impressions.current);
  return impr > 0 ? clicks / impr : null;
}
