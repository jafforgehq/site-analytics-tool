// Mediavine Journey eligibility tracker: rolling-30-day sessions against the
// program minimum, with a projected crossing date from the traffic forecast.

import { forecastSeries, type SeriesPoint } from "@/lib/forecast";

/** Mediavine Journey: 1,000 sessions per rolling month. */
export const JOURNEY_TARGET_SESSIONS = 1000;
const WINDOW_DAYS = 30;
const PROJECTION_DAYS = 180;

export type JourneyStatus = "reached" | "projected" | "unlikely" | "no_data";

export interface JourneyProgress {
  status: JourneyStatus;
  /** Sessions in the latest 30 days of data. */
  current: number;
  target: number;
  /** 0..1, capped at 1. */
  progress: number;
  remaining: number;
  /** First date the rolling 30-day total is forecast to reach the target. */
  projectedDate: string | null;
  /** Date of the latest observed day. */
  asOf: string | null;
}

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function rollingSum(values: number[], end: number): number {
  let total = 0;
  for (let i = Math.max(0, end - WINDOW_DAYS + 1); i <= end; i += 1) {
    total += values[i];
  }
  return total;
}

export function computeJourneyProgress(
  sessions: SeriesPoint[],
  target: number = JOURNEY_TARGET_SESSIONS,
): JourneyProgress {
  if (sessions.length === 0) {
    return {
      status: "no_data",
      current: 0,
      target,
      progress: 0,
      remaining: target,
      projectedDate: null,
      asOf: null,
    };
  }

  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const asOf = sorted[sorted.length - 1].date;
  const cutoff = addDays(asOf, -(WINDOW_DAYS - 1));
  const current = sorted
    .filter((p) => p.date >= cutoff)
    .reduce((t, p) => t + p.value, 0);
  const base = {
    current,
    target,
    progress: Math.min(1, current / target),
    remaining: Math.max(0, target - current),
    asOf,
  };

  if (current >= target) {
    return { ...base, status: "reached", projectedDate: null };
  }

  const forecast = forecastSeries(sorted, PROJECTION_DAYS);
  if (!forecast) return { ...base, status: "unlikely", projectedDate: null };

  // Slide the 30-day window across observed + forecast days.
  const values = [
    ...sorted.map((p) => p.value),
    ...forecast.points.map((p) => p.value),
  ];
  const dates = [
    ...sorted.map((p) => p.date),
    ...forecast.points.map((p) => p.date),
  ];
  for (let i = sorted.length; i < values.length; i += 1) {
    if (rollingSum(values, i) >= target) {
      return { ...base, status: "projected", projectedDate: dates[i] };
    }
  }
  return { ...base, status: "unlikely", projectedDate: null };
}
