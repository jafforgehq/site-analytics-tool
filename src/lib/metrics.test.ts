import { describe, expect, it } from "vitest";
import {
  percentageChange,
  weightedCtr,
  weightedAveragePosition,
  splitPeriods,
} from "@/lib/metrics";

describe("percentageChange", () => {
  it("computes a normal change", () => {
    expect(percentageChange(150, 100)).toBe(50);
  });
  it("handles a decrease", () => {
    expect(percentageChange(80, 100)).toBeCloseTo(-20);
  });
  it("returns null when the previous value is zero", () => {
    expect(percentageChange(50, 0)).toBeNull();
  });
});

describe("weightedCtr", () => {
  it("is clicks / impressions", () => {
    expect(weightedCtr(50, 1000)).toBeCloseTo(0.05);
  });
  it("returns null with no impressions", () => {
    expect(weightedCtr(0, 0)).toBeNull();
  });
});

describe("weightedAveragePosition", () => {
  it("weights by impressions, not a flat average", () => {
    const rows = [
      { impressions: 100, average_position: 10 },
      { impressions: 900, average_position: 2 },
    ];
    // Flat avg would be 6; weighted = (1000 + 1800) / 1000 = 2.8
    expect(weightedAveragePosition(rows)).toBeCloseTo(2.8);
  });
  it("ignores rows without position data", () => {
    const rows = [
      { impressions: 100, average_position: null },
      { impressions: 100, average_position: 4 },
    ];
    expect(weightedAveragePosition(rows)).toBeCloseTo(4);
  });
  it("returns null with no usable rows", () => {
    expect(weightedAveragePosition([])).toBeNull();
  });
});

describe("splitPeriods", () => {
  it("splits into current and equal preceding period", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      metric_date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      v: i + 1,
    }));
    const { current, previous } = splitPeriods(rows, 3);
    expect(current.map((r) => r.v)).toEqual([4, 5, 6]);
    expect(previous.map((r) => r.v)).toEqual([1, 2, 3]);
  });
});
