import {
  percentageChange,
  sumBy,
  weightedAveragePosition,
  weightedCtr,
} from "@/lib/metrics";

export interface BreakdownInput {
  key: string;
  metric_date: string;
  clicks: number;
  impressions: number;
  average_position: number | null;
}

export interface TermRow {
  key: string;
  clicks: number;
  clicksPrev: number;
  clicksPct: number | null;
  impressions: number;
  ctr: number | null;
  position: number | null;
}

function isoMinus(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate per-day query/page rows into the top terms for the current period,
 * each with its previous-period click delta. Periods are anchored to the latest
 * available date (brief §22), so a reporting lag doesn't skew the comparison.
 */
export function aggregateBreakdown(
  rows: BreakdownInput[],
  days: number,
  topN = 50,
): TermRow[] {
  if (rows.length === 0) return [];

  let latest = rows[0].metric_date;
  for (const r of rows) if (r.metric_date > latest) latest = r.metric_date;

  const currentStart = isoMinus(latest, days - 1);
  const previousStart = isoMinus(latest, days * 2 - 1);

  const current = new Map<string, BreakdownInput[]>();
  const previous = new Map<string, number>();

  for (const r of rows) {
    if (r.metric_date >= currentStart) {
      const list = current.get(r.key) ?? [];
      list.push(r);
      current.set(r.key, list);
    } else if (r.metric_date >= previousStart) {
      previous.set(r.key, (previous.get(r.key) ?? 0) + r.clicks);
    }
  }

  const out: TermRow[] = [];
  for (const [key, list] of current) {
    const clicks = sumBy(list, (r) => r.clicks);
    const impressions = sumBy(list, (r) => r.impressions);
    const clicksPrev = previous.get(key) ?? 0;
    out.push({
      key,
      clicks,
      clicksPrev,
      clicksPct: percentageChange(clicks, clicksPrev),
      impressions,
      ctr: weightedCtr(clicks, impressions),
      position: weightedAveragePosition(list),
    });
  }

  return out.sort((a, b) => b.clicks - a.clicks).slice(0, topN);
}
