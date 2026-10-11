// Search opportunity finders - pure computations over the Search Console rows
// the dashboard already stores. No network, unit-testable.

export interface QueryDailyInput {
  metric_date: string;
  query: string;
  clicks: number;
  impressions: number;
  average_position: number | null;
}

export interface QueryStat {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Typical Google organic CTR by (rounded) position. Industry-average curve,
 * deliberately conservative - used only to rank where a better title/snippet
 * is likely to pay off, never shown as a measured value.
 */
const EXPECTED_CTR_BY_POSITION = [
  0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018,
];

export function expectedCtr(position: number): number {
  const idx = Math.min(
    EXPECTED_CTR_BY_POSITION.length - 1,
    Math.max(0, Math.round(position) - 1),
  );
  return EXPECTED_CTR_BY_POSITION[idx];
}

function isoMinus(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Collapse per-day query rows into one stat per query for the most recent
 * `days`, anchored to the latest available date. Unlike the top-terms table
 * this keeps EVERY query: striking-distance queries have few clicks, so a
 * top-N-by-clicks cut would drop exactly the rows we're looking for.
 */
export function aggregateQueries(
  rows: QueryDailyInput[],
  days: number,
): QueryStat[] {
  if (rows.length === 0) return [];
  let latest = rows[0].metric_date;
  for (const r of rows) if (r.metric_date > latest) latest = r.metric_date;
  const start = isoMinus(latest, days - 1);

  const acc = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      weightedPos: number;
      posImpr: number;
    }
  >();
  for (const r of rows) {
    if (r.metric_date < start) continue;
    const a = acc.get(r.query) ?? {
      clicks: 0,
      impressions: 0,
      weightedPos: 0,
      posImpr: 0,
    };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    if (r.average_position != null && r.impressions > 0) {
      a.weightedPos += r.average_position * r.impressions;
      a.posImpr += r.impressions;
    }
    acc.set(r.query, a);
  }

  const out: QueryStat[] = [];
  for (const [query, a] of acc) {
    if (a.posImpr === 0 || a.impressions === 0) continue;
    out.push({
      query,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr: a.clicks / a.impressions,
      position: a.weightedPos / a.posImpr,
    });
  }
  return out;
}

export interface StrikingDistanceRow extends QueryStat {
  /** Extra clicks if the query reached position 3 at the expected CTR. */
  potentialClicks: number;
}

/**
 * Queries ranking just off page one (positions 8-20) with real demand. A
 * small content or internal-link push usually moves these onto page one.
 */
export function findStrikingDistance(
  stats: QueryStat[],
  opts: { minImpressions?: number; limit?: number } = {},
): StrikingDistanceRow[] {
  const { minImpressions = 50, limit = 25 } = opts;
  return stats
    .filter(
      (s) =>
        s.position >= 8 && s.position <= 20 && s.impressions >= minImpressions,
    )
    .map((s) => ({
      ...s,
      potentialClicks: Math.max(
        0,
        Math.round(s.impressions * (expectedCtr(3) - s.ctr)),
      ),
    }))
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, limit);
}

export interface CtrGapRow extends QueryStat {
  expectedCtr: number;
  /** Clicks missing versus the expected CTR for this position. */
  missedClicks: number;
}

/**
 * Queries on page one whose CTR is well below what their position normally
 * earns - the title/meta description isn't winning the click.
 */
export function findCtrGaps(
  stats: QueryStat[],
  opts: { minImpressions?: number; limit?: number } = {},
): CtrGapRow[] {
  const { minImpressions = 100, limit = 25 } = opts;
  return stats
    .filter((s) => s.position <= 10 && s.impressions >= minImpressions)
    .map((s) => {
      const expected = expectedCtr(s.position);
      return {
        ...s,
        expectedCtr: expected,
        missedClicks: Math.round(s.impressions * (expected - s.ctr)),
      };
    })
    .filter((s) => s.ctr < s.expectedCtr * 0.6 && s.missedClicks >= 5)
    .sort((a, b) => b.missedClicks - a.missedClicks)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Cannibalization: one query showing several of your pages.
// ---------------------------------------------------------------------------
export interface QueryPageInput {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  average_position: number | null;
}

export interface CannibalizationRow {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  pages: {
    page: string;
    clicks: number;
    impressions: number;
    position: number | null;
  }[];
}

export function findCannibalization(
  rows: QueryPageInput[],
  opts: {
    minQueryImpressions?: number;
    minPageImpressions?: number;
    limit?: number;
  } = {},
): CannibalizationRow[] {
  const {
    minQueryImpressions = 50,
    minPageImpressions = 10,
    limit = 25,
  } = opts;
  const byQuery = new Map<string, QueryPageInput[]>();
  for (const r of rows) {
    if (r.impressions < minPageImpressions) continue;
    const list = byQuery.get(r.query) ?? [];
    list.push(r);
    byQuery.set(r.query, list);
  }

  const out: CannibalizationRow[] = [];
  for (const [query, list] of byQuery) {
    if (list.length < 2) continue;
    const totalImpressions = list.reduce((t, r) => t + r.impressions, 0);
    if (totalImpressions < minQueryImpressions) continue;
    out.push({
      query,
      totalClicks: list.reduce((t, r) => t + r.clicks, 0),
      totalImpressions,
      pages: list
        .map((r) => ({
          page: r.page,
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.average_position,
        }))
        .sort((a, b) => b.impressions - a.impressions),
    });
  }
  return out
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// New-page tracker: how fast do freshly published pages start earning?
// ---------------------------------------------------------------------------
export interface PageDailyInput {
  page: string;
  metric_date: string;
  clicks: number;
  impressions: number;
  average_position: number | null;
}

export interface NewPageRow {
  page: string;
  /** First date the page appeared in Search Console data. */
  firstSeen: string;
  daysLive: number;
  /** Days from first impression to first click; null if it has no click yet. */
  daysToFirstClick: number | null;
  clicks: number;
  impressions: number;
  /** Clicks in the page's most recent 7 days. */
  recentClicks: number;
}

/**
 * Pages whose first appearance in the data is at least `graceDays` after the
 * data begins - i.e. pages that did not already exist when tracking started.
 * (Retention bounds the history, so "new" means new within the stored window.)
 */
export function findNewPages(
  rows: PageDailyInput[],
  today: string,
  graceDays = 7,
  limit = 25,
): NewPageRow[] {
  if (rows.length === 0) return [];
  let dataStart = rows[0].metric_date;
  for (const r of rows)
    if (r.metric_date < dataStart) dataStart = r.metric_date;
  const cutoff = isoMinus(today, 6);

  const byPage = new Map<string, PageDailyInput[]>();
  for (const r of rows) {
    const list = byPage.get(r.page) ?? [];
    list.push(r);
    byPage.set(r.page, list);
  }

  const out: NewPageRow[] = [];
  for (const [page, list] of byPage) {
    const dated = list
      .filter((r) => r.impressions > 0 || r.clicks > 0)
      .sort((a, b) => (a.metric_date < b.metric_date ? -1 : 1));
    if (dated.length === 0) continue;
    const firstSeen = dated[0].metric_date;
    if (firstSeen < isoMinus(dataStart, -graceDays)) continue;

    const firstClick = dated.find((r) => r.clicks > 0);
    out.push({
      page,
      firstSeen,
      daysLive: daysBetween(firstSeen, today),
      daysToFirstClick: firstClick
        ? daysBetween(firstSeen, firstClick.metric_date)
        : null,
      clicks: dated.reduce((t, r) => t + r.clicks, 0),
      impressions: dated.reduce((t, r) => t + r.impressions, 0),
      recentClicks: dated
        .filter((r) => r.metric_date >= cutoff)
        .reduce((t, r) => t + r.clicks, 0),
    });
  }
  return out
    .sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1))
    .slice(0, limit);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}
