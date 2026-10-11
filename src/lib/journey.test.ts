import { describe, expect, it } from "vitest";
import { computeJourneyProgress } from "@/lib/journey";
import type { SeriesPoint } from "@/lib/forecast";

function series(n: number, valueAt: (i: number) => number): SeriesPoint[] {
  const start = Date.parse("2026-07-01T00:00:00Z");
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    value: valueAt(i),
  }));
}

describe("computeJourneyProgress", () => {
  it("reports no data for an empty series", () => {
    const p = computeJourneyProgress([]);
    expect(p.status).toBe("no_data");
    expect(p.remaining).toBe(1000);
  });

  it("marks the target reached when 30-day sessions are high enough", () => {
    const p = computeJourneyProgress(series(60, () => 40)); // 1,200 / 30d
    expect(p.status).toBe("reached");
    expect(p.progress).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.current).toBe(1200);
  });

  it("projects a crossing date for growing traffic", () => {
    const p = computeJourneyProgress(series(60, (i) => 10 + i * 0.5));
    expect(p.status).toBe("projected");
    expect(p.projectedDate).not.toBeNull();
    expect(p.progress).toBeLessThan(1);
    expect(p.projectedDate! > p.asOf!).toBe(true);
  });

  it("calls flat low traffic unlikely", () => {
    const p = computeJourneyProgress(series(60, () => 3));
    expect(p.status).toBe("unlikely");
    expect(p.projectedDate).toBeNull();
    expect(p.current).toBe(90);
  });

  it("only counts the latest 30 days toward current", () => {
    const p = computeJourneyProgress(series(60, (i) => (i < 30 ? 100 : 1)));
    expect(p.current).toBe(30);
  });
});
