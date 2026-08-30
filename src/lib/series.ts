// Row → series adapters and portfolio-level decay, kept out of component files
// (react-refresh) and reusable from the report/briefing code.

import type { SeriesPoint } from "@/lib/forecast";
import { computeDecayingPages, type DecayRow } from "@/lib/decay";
import type {
  AnalyticsDaily,
  SearchDaily,
  SearchPageDaily,
  Site,
} from "@/types/database";

export function sessionsSeries(rows: AnalyticsDaily[]): SeriesPoint[] {
  return rows.map((r) => ({ date: r.metric_date, value: r.sessions }));
}

export function clicksSeries(rows: SearchDaily[]): SeriesPoint[] {
  return rows
    .filter((r) => r.engine === "google")
    .map((r) => ({ date: r.metric_date, value: r.clicks }));
}

export interface PortfolioDecayRow extends DecayRow {
  siteId: string;
  siteName: string;
}

const DECAY_WINDOW_DAYS = 28;
const DECAY_TOP_N = 10;

export function computePortfolioDecay(
  rows: SearchPageDaily[],
  sites: Pick<Site, "id" | "name">[],
  today: string,
): PortfolioDecayRow[] {
  const bySite = new Map<string, SearchPageDaily[]>();
  for (const row of rows) {
    const list = bySite.get(row.site_id) ?? [];
    list.push(row);
    bySite.set(row.site_id, list);
  }
  const out: PortfolioDecayRow[] = [];
  for (const site of sites) {
    const siteRows = bySite.get(site.id);
    if (!siteRows) continue;
    for (const decay of computeDecayingPages(
      siteRows,
      DECAY_WINDOW_DAYS,
      today,
      DECAY_TOP_N,
    )) {
      out.push({ ...decay, siteId: site.id, siteName: site.name });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, DECAY_TOP_N);
}
