import { describe, expect, it } from "vitest";
import {
  forecastSeries,
  toContiguousSeries,
  type SeriesPoint,
} from "@/lib/forecast";

const DAY_MS = 86_400_000;

function makeSeries(
  days: number,
  fn: (i: number) => number,
  start = "2026-01-01",
): SeriesPoint[] {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(startMs + i * DAY_MS).toISOString().slice(0, 10),
    value: fn(i),
  }));
}

describe("toContiguousSeries", () => {
  it("returns empty for no rows", () => {
    expect(toContiguousSeries([])).toEqual([]);
  });

  it("sorts and keeps a contiguous series unchanged", () => {
    const rows = makeSeries(5, (i) => i * 10);
    const shuffled = [rows[3], rows[0], rows[4], rows[1], rows[2]];
    expect(toContiguousSeries(shuffled)).toEqual(rows);
  });

  it("linearly interpolates interior gaps", () => {
    const rows = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-04", value: 40 },
    ];
    expect(toContiguousSeries(rows)).toEqual([
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 20 },
      { date: "2026-01-03", value: 30 },
      { date: "2026-01-04", value: 40 },
    ]);
  });
});

describe("forecastSeries", () => {
  it("returns null when there is too little history", () => {
    expect(
      forecastSeries(
        makeSeries(5, () => 100),
        30,
      ),
    ).toBeNull();
    expect(forecastSeries([], 30)).toBeNull();
  });

  it("uses linear fallback for short series and follows the trend", () => {
    // 10 days rising by 5/day.
    const forecast = forecastSeries(
      makeSeries(10, (i) => 100 + 5 * i),
      10,
    );
    expect(forecast).not.toBeNull();
    expect(forecast!.method).toBe("linear");
    expect(forecast!.trendPerDay).toBeCloseTo(5, 5);
    // Day 10 (first forecast day) should be ~150.
    expect(forecast!.points[0].value).toBeCloseTo(150, 3);
    expect(forecast!.points[0].date).toBe("2026-01-11");
  });

  it("uses Holt-Winters for longer series and captures weekly seasonality", () => {
    // 8 weeks: upward trend + strong weekday/weekend pattern, deterministic.
    const season = [0, 10, 12, 14, 12, 8, -20]; // day-of-week offsets
    const forecast = forecastSeries(
      makeSeries(56, (i) => 200 + 2 * i + season[i % 7]!),
      14,
    );
    expect(forecast).not.toBeNull();
    expect(forecast!.method).toBe("holt-winters");
    // Trend recovered near 2/day.
    expect(forecast!.trendPerDay).toBeGreaterThan(1);
    expect(forecast!.trendPerDay).toBeLessThan(3);
    // The forecast preserves the weekly shape: the "weekend" slot (i%7 === 6)
    // stays the weekly minimum.
    const week = forecast!.points.slice(0, 7);
    const values = week.map((p) => p.value);
    const minIdx = values.indexOf(Math.min(...values));
    expect((56 + minIdx) % 7).toBe(6);
    // Intervals bracket the point estimate and widen with horizon.
    for (const p of forecast!.points) {
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
    }
    const spreadFirst = forecast!.points[0].upper - forecast!.points[0].lower;
    const spreadLast = forecast!.points[13].upper - forecast!.points[13].lower;
    expect(spreadLast).toBeGreaterThanOrEqual(spreadFirst);
  });

  it("never forecasts negative traffic", () => {
    const forecast = forecastSeries(
      makeSeries(20, (i) => 100 - 6 * i),
      30,
    );
    expect(forecast).not.toBeNull();
    for (const p of forecast!.points) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.lower).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic", () => {
    const rows = makeSeries(42, (i) => 300 + i + (i % 7) * 5);
    expect(forecastSeries(rows, 7)).toEqual(forecastSeries(rows, 7));
  });
});
