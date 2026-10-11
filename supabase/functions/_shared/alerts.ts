// Pure alert detection - no Deno/npm imports, unit-testable from Vitest.
// Each detector returns candidates with a deterministic dedupe_key so the
// database (unique constraint) makes re-detection idempotent.

export type AlertKind =
  | "traffic_drop"
  | "site_down"
  | "sync_failing"
  | "indexing_issue";
export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertCandidate {
  site_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  dedupe_key: string;
}

export interface SiteInfo {
  id: string;
  name: string;
}
export interface DailyClicks {
  metric_date: string;
  clicks: number;
}
export interface UptimeCheck {
  checked_at: string;
  ok: boolean;
}
export interface IntegrationState {
  source: string;
  enabled: boolean;
  consecutive_failures: number;
}
export interface InspectionState {
  verdict: string | null;
  coverage_state: string | null;
}

export const TRAFFIC_DROP_WARN = 0.3;
export const TRAFFIC_DROP_CRITICAL = 0.5;
export const TRAFFIC_MIN_PREVIOUS = 50;
export const SYNC_FAILURE_THRESHOLD = 3;
export const INDEXING_ISSUE_THRESHOLD = 5;

const DAY = 86_400_000;

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO-8601 week label like "2026-W41" for a YYYY-MM-DD date. */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function detectTrafficDrop(
  site: SiteInfo,
  daily: DailyClicks[],
  now: Date,
): AlertCandidate | null {
  const end = new Date(now.getTime() - DAY); // last complete UTC day
  const endStr = utcDate(end);
  const curStart = utcDate(new Date(end.getTime() - 6 * DAY));
  const prevEnd = utcDate(new Date(end.getTime() - 7 * DAY));
  const prevStart = utcDate(new Date(end.getTime() - 13 * DAY));

  let current = 0;
  let previous = 0;
  for (const r of daily) {
    if (r.metric_date >= curStart && r.metric_date <= endStr)
      current += r.clicks;
    else if (r.metric_date >= prevStart && r.metric_date <= prevEnd)
      previous += r.clicks;
  }
  if (previous < TRAFFIC_MIN_PREVIOUS) return null;
  const drop = (previous - current) / previous;
  if (drop < TRAFFIC_DROP_WARN) return null;

  const pct = Math.round(drop * 100);
  return {
    site_id: site.id,
    kind: "traffic_drop",
    severity: drop >= TRAFFIC_DROP_CRITICAL ? "critical" : "warning",
    title: `${site.name}: Google clicks down ${pct}% week over week`,
    detail: `${current} clicks in the 7 days to ${endStr} vs ${previous} in the 7 days before.`,
    dedupe_key: `traffic_drop:${site.id}:${isoWeek(endStr)}`,
  };
}

export function detectSiteDown(
  site: SiteInfo,
  checks: UptimeCheck[],
  now: Date,
): AlertCandidate | null {
  const last2 = [...checks]
    .sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at))
    .slice(0, 2);
  if (last2.length < 2 || last2.some((c) => c.ok)) return null;
  return {
    site_id: site.id,
    kind: "site_down",
    severity: "critical",
    title: `${site.name} appears to be down`,
    detail: `The last 2 uptime checks failed (latest at ${last2[0].checked_at}).`,
    dedupe_key: `site_down:${site.id}:${utcDate(now)}`,
  };
}

export function detectSyncFailing(
  site: SiteInfo,
  integrations: IntegrationState[],
  now: Date,
): AlertCandidate[] {
  return integrations
    .filter(
      (i) => i.enabled && i.consecutive_failures >= SYNC_FAILURE_THRESHOLD,
    )
    .map((i) => ({
      site_id: site.id,
      kind: "sync_failing" as const,
      severity: "warning" as const,
      title: `${site.name}: ${i.source.toUpperCase()} sync keeps failing`,
      detail: `${i.consecutive_failures} consecutive failed runs.`,
      dedupe_key: `sync_failing:${site.id}:${i.source}:${utcDate(now)}`,
    }));
}

export function isNotIndexed(i: InspectionState): boolean {
  const cov = i.coverage_state ?? "";
  return (
    i.verdict === "FAIL" ||
    cov.startsWith("Crawled - currently not indexed") ||
    cov.startsWith("Discovered - currently not indexed")
  );
}

export function detectIndexingIssue(
  site: SiteInfo,
  inspections: InspectionState[],
  now: Date,
): AlertCandidate | null {
  const count = inspections.filter(isNotIndexed).length;
  if (count < INDEXING_ISSUE_THRESHOLD) return null;
  return {
    site_id: site.id,
    kind: "indexing_issue",
    severity: "info",
    title: `${site.name}: ${count} URLs not indexed by Google`,
    detail: `${count} inspected URLs failed inspection or are crawled/discovered but not indexed.`,
    dedupe_key: `indexing_issue:${site.id}:${isoWeek(utcDate(now))}`,
  };
}

export interface SiteSignals {
  site: SiteInfo;
  googleClicks: DailyClicks[];
  uptime: UptimeCheck[];
  integrations: IntegrationState[];
  inspections: InspectionState[];
}

export function detectAlerts(s: SiteSignals, now: Date): AlertCandidate[] {
  return [
    detectTrafficDrop(s.site, s.googleClicks, now),
    detectSiteDown(s.site, s.uptime, now),
    ...detectSyncFailing(s.site, s.integrations, now),
    detectIndexingIssue(s.site, s.inspections, now),
  ].filter((a): a is AlertCandidate => a !== null);
}

const escapeHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain digest email content for newly created alerts. */
export function buildDigest(alerts: AlertCandidate[]): {
  subject: string;
  html: string;
} {
  const worst = alerts.some((a) => a.severity === "critical")
    ? "critical"
    : alerts.some((a) => a.severity === "warning")
      ? "warning"
      : "info";
  const items = alerts
    .map(
      (a) =>
        `<li><strong>[${a.severity}]</strong> ${escapeHtml(a.title)}<br>${escapeHtml(a.detail)}</li>`,
    )
    .join("");
  return {
    subject: `Site Analytics: ${alerts.length} new alert${alerts.length === 1 ? "" : "s"} (${worst})`,
    html: `<ul>${items}</ul>`,
  };
}
