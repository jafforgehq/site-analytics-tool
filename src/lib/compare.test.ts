import { describe, expect, it } from "vitest";
import {
  comparisonDate,
  compareOffsetDays,
  historyDaysNeeded,
  isCompareModeAvailable,
  splitByOffset,
} from "@/lib/compare";

function days(from: string, n: number, skip: string[] = []) {
  const out: { metric_date: string; v: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = Date.parse(`${from}T00:00:00Z`) + i * 86_400_000;
    const d = new Date(t).toISOString().slice(0, 10);
    if (!skip.includes(d)) out.push({ metric_date: d, v: i });
  }
  return out;
}

describe("compareOffsetDays", () => {
  it("maps each mode to its offset", () => {
    expect(compareOffsetDays("previous", 28)).toBe(28);
    expect(compareOffsetDays("week", 1)).toBe(7);
    expect(compareOffsetDays("year", 30)).toBe(364);
  });
  it("only offers last-week compare for windows of 7 days or fewer", () => {
    expect(isCompareModeAvailable("week", 7)).toBe(true);
    expect(isCompareModeAvailable("week", 14)).toBe(false);
    expect(isCompareModeAvailable("year", 360)).toBe(true);
  });
  it("sizes the history fetch", () => {
    expect(historyDaysNeeded("previous", 30)).toBe(60);
    expect(historyDaysNeeded("year", 30)).toBe(394);
  });
});

describe("splitByOffset", () => {
  it("compares yesterday with the day before for a 1-day window", () => {
    const rows = days("2026-09-01", 10);
    const { current, previous } = splitByOffset(rows, 1, 1);
    expect(current.map((r) => r.metric_date)).toEqual(["2026-09-10"]);
    expect(previous.map((r) => r.metric_date)).toEqual(["2026-09-09"]);
  });

  it("uses calendar dates, so a missing day does not slide the window", () => {
    const rows = days("2026-09-01", 14, ["2026-09-12"]);
    const { current, previous } = splitByOffset(rows, 7, 7);
    expect(current).toHaveLength(6);
    expect(previous).toHaveLength(7);
    expect(previous[0].metric_date).toBe("2026-09-01");
  });

  it("supports a same-weekday-last-week comparison", () => {
    const rows = days("2026-09-01", 14);
    const { current, previous } = splitByOffset(rows, 1, 7);
    expect(current[0].metric_date).toBe("2026-09-14");
    expect(previous[0].metric_date).toBe("2026-09-07");
  });

  it("returns empty windows for no rows", () => {
    expect(splitByOffset([], 7, 7)).toEqual({ current: [], previous: [] });
  });
});

describe("comparisonDate", () => {
  it("shifts back by the offset", () => {
    expect(comparisonDate("2026-09-10", 7)).toBe("2026-09-03");
    expect(comparisonDate("2026-03-01", 1)).toBe("2026-02-28");
  });
});
