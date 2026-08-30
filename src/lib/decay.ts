// Decaying-content detection: pages whose search clicks have dropped
// meaningfully versus their own prior-period baseline. Pure computation over
// rows the browser already fetched (search_page_daily), producing a ranked
// "content refresh queue".

export interface PageDailyRow {
  page: string;
  metric_date: string;
  clicks: number;
  impressions: number;
  average_position: number | null;
}

export interface DecayRow {
  page: string;
  currentClicks: number;
  previousClicks: number;
  changePct: number; // negative for decay
  currentPosition: number | null;
  previousPosition: number | null;
  /** Ranking score: bigger = more urgent (larger drop on a bigger page). */
  score: number;
}

/** Minimum prior-period clicks before a page can qualify - avoids flagging
 * noise on pages that never had traffic. */
const MIN_PREVIOUS_CLICKS = 10;
/** A page must lose at least this share of its clicks to be "decaying". */
const MIN_DROP = 0.25;

function impressionsWeightedPosition(rows: PageDailyRow[]): number | null {
  let weighted = 0;
  let impressions = 0;
  for (const row of rows) {
    if (row.average_position == null || row.impressions <= 0) continue;
    weighted += row.average_position * row.impressions;
    impressions += row.impressions;
  }
  return impressions === 0 ? null : weighted / impressions;
}

/**
 * Compare each page's clicks in the most recent `days` against the preceding
 * `days` (based on the calendar cutoff, not row counts - sparse pages must
 * not slide windows). Returns decaying pages ranked most-urgent first.
 */
export function computeDecayingPages(
  rows: PageDailyRow[],
  days: number,
  today: string,
  limit = 20,
): DecayRow[] {
  const currentStart = shiftDate(today, -(days - 1));
  const previousStart = shiftDate(today, -(days * 2 - 1));

  const byPage = new Map<
    string,
    { current: PageDailyRow[]; previous: PageDailyRow[] }
  >();
  for (const row of rows) {
    if (row.metric_date > today || row.metric_date < previousStart) continue;
    let bucket = byPage.get(row.page);
    if (!bucket) {
      bucket = { current: [], previous: [] };
      byPage.set(row.page, bucket);
    }
    if (row.metric_date >= currentStart) bucket.current.push(row);
    else bucket.previous.push(row);
  }

  const out: DecayRow[] = [];
  for (const [page, bucket] of byPage) {
    const previousClicks = bucket.previous.reduce(
      (total, r) => total + r.clicks,
      0,
    );
    if (previousClicks < MIN_PREVIOUS_CLICKS) continue;
    const currentClicks = bucket.current.reduce(
      (total, r) => total + r.clicks,
      0,
    );
    const changePct = ((currentClicks - previousClicks) / previousClicks) * 100;
    if (changePct > -MIN_DROP * 100) continue;

    out.push({
      page,
      currentClicks,
      previousClicks,
      changePct,
      currentPosition: impressionsWeightedPosition(bucket.current),
      previousPosition: impressionsWeightedPosition(bucket.previous),
      // Drop share × log of lost volume: a 60% drop on a 500-click page
      // outranks a 90% drop on a 12-click page.
      score:
        (Math.abs(changePct) / 100) *
        Math.log10(1 + (previousClicks - currentClicks)),
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function shiftDate(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
