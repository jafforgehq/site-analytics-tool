import { describe, expect, it } from "vitest";
import { aggregateBreakdown, type BreakdownInput } from "@/lib/search-terms";

// Window of 2 days anchored at 2026-06-20 (latest). Current = 06-19..06-20,
// previous = 06-17..06-18.
function row(
  key: string,
  date: string,
  clicks: number,
  impressions: number,
  pos: number | null = 5,
): BreakdownInput {
  return { key, metric_date: date, clicks, impressions, average_position: pos };
}

describe("aggregateBreakdown", () => {
  it("aggregates current period and computes the previous-period delta", () => {
    const rows = [
      row("alpha", "2026-06-17", 5, 100), // prev
      row("alpha", "2026-06-18", 5, 100), // prev
      row("alpha", "2026-06-19", 10, 200), // current
      row("alpha", "2026-06-20", 10, 200), // current
    ];
    const [term] = aggregateBreakdown(rows, 2);
    expect(term.key).toBe("alpha");
    expect(term.clicks).toBe(20);
    expect(term.clicksPrev).toBe(10);
    expect(term.clicksPct).toBe(100);
    expect(term.impressions).toBe(400);
    expect(term.ctr).toBeCloseTo(0.05);
  });

  it("sorts by current clicks and respects topN", () => {
    const rows = [
      row("low", "2026-06-20", 1, 10),
      row("high", "2026-06-20", 100, 1000),
      row("mid", "2026-06-20", 50, 500),
    ];
    const result = aggregateBreakdown(rows, 1, 2);
    expect(result.map((r) => r.key)).toEqual(["high", "mid"]);
  });

  it("returns empty for no rows", () => {
    expect(aggregateBreakdown([], 7)).toEqual([]);
  });

  it("treats a brand-new term as having zero previous clicks", () => {
    const [term] = aggregateBreakdown([row("new", "2026-06-20", 8, 50)], 1);
    expect(term.clicksPrev).toBe(0);
    expect(term.clicksPct).toBeNull();
  });
});
