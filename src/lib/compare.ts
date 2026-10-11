// Period comparison: which earlier window a range is compared against, and a
// date-based (not row-count-based) split so missing sync days can't slide the
// comparison window.

export type CompareMode = "previous" | "week" | "year";

export const COMPARE_LABEL: Record<CompareMode, string> = {
  previous: "Previous period",
  week: "Same days last week",
  year: "Same days last year",
};

/** 364 = 52 weeks, so the comparison lands on the same weekday. */
const YEAR_OFFSET_DAYS = 364;

/** How many days back the comparison window sits. */
export function compareOffsetDays(mode: CompareMode, days: number): number {
  if (mode === "week") return 7;
  if (mode === "year") return YEAR_OFFSET_DAYS;
  return days;
}

/** "Last week" overlaps the current window once it spans more than 7 days. */
export function isCompareModeAvailable(
  mode: CompareMode,
  days: number,
): boolean {
  return mode !== "week" || days <= 7;
}

/** Days of history the comparison needs beyond "today". */
export function historyDaysNeeded(mode: CompareMode, days: number): number {
  return days + compareOffsetDays(mode, days);
}

function shift(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Split rows into the current window (the `days` ending at the latest row
 * date) and the comparison window `offset` days earlier.
 */
export function splitByOffset<T extends { metric_date: string }>(
  rows: T[],
  days: number,
  offset: number,
): { current: T[]; previous: T[] } {
  if (rows.length === 0) return { current: [], previous: [] };
  let latest = rows[0].metric_date;
  for (const r of rows) if (r.metric_date > latest) latest = r.metric_date;

  const currentStart = shift(latest, -(days - 1));
  const previousEnd = shift(latest, -offset);
  const previousStart = shift(previousEnd, -(days - 1));

  const byDate = (a: T, b: T) =>
    a.metric_date < b.metric_date ? -1 : a.metric_date > b.metric_date ? 1 : 0;
  return {
    current: rows
      .filter((r) => r.metric_date >= currentStart && r.metric_date <= latest)
      .sort(byDate),
    previous: rows
      .filter(
        (r) => r.metric_date >= previousStart && r.metric_date <= previousEnd,
      )
      .sort(byDate),
  };
}

/** The date `offset` days before `date` - used to overlay the comparison line. */
export function comparisonDate(date: string, offset: number): string {
  return shift(date, -offset);
}
