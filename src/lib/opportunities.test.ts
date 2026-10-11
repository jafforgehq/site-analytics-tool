import { describe, expect, it } from "vitest";
import {
  aggregateQueries,
  expectedCtr,
  findCannibalization,
  findCtrGaps,
  findNewPages,
  findStrikingDistance,
  type QueryStat,
} from "@/lib/opportunities";

const stat = (
  query: string,
  position: number,
  impressions: number,
  clicks: number,
): QueryStat => ({
  query,
  position,
  impressions,
  clicks,
  ctr: clicks / impressions,
});

describe("expectedCtr", () => {
  it("falls with position and clamps at the tail", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(5)).toBeGreaterThan(expectedCtr(10));
    expect(expectedCtr(80)).toBe(expectedCtr(10));
    expect(expectedCtr(0.2)).toBe(expectedCtr(1));
  });
});

describe("aggregateQueries", () => {
  it("weights position by impressions and keeps low-click queries", () => {
    const rows = [
      {
        metric_date: "2026-09-10",
        query: "a",
        clicks: 0,
        impressions: 90,
        average_position: 10,
      },
      {
        metric_date: "2026-09-09",
        query: "a",
        clicks: 1,
        impressions: 10,
        average_position: 20,
      },
      {
        metric_date: "2026-08-01",
        query: "old",
        clicks: 5,
        impressions: 50,
        average_position: 3,
      },
    ];
    const out = aggregateQueries(rows, 7);
    expect(out).toHaveLength(1);
    expect(out[0].impressions).toBe(100);
    expect(out[0].position).toBeCloseTo(11, 5);
    expect(out[0].ctr).toBeCloseTo(0.01, 5);
  });

  it("skips queries with no position data", () => {
    const rows = [
      {
        metric_date: "2026-09-10",
        query: "x",
        clicks: 1,
        impressions: 10,
        average_position: null,
      },
    ];
    expect(aggregateQueries(rows, 7)).toEqual([]);
  });
});

describe("findStrikingDistance", () => {
  it("keeps positions 8-20 with enough impressions, biggest upside first", () => {
    const out = findStrikingDistance([
      stat("page one", 4, 5000, 100),
      stat("big upside", 12, 2000, 4),
      stat("small upside", 9, 200, 2),
      stat("too deep", 35, 9000, 0),
      stat("no demand", 11, 10, 0),
    ]);
    expect(out.map((r) => r.query)).toEqual(["big upside", "small upside"]);
    expect(out[0].potentialClicks).toBeGreaterThan(out[1].potentialClicks);
  });
});

describe("findCtrGaps", () => {
  it("flags page-one queries far below their expected CTR", () => {
    const out = findCtrGaps([
      stat("healthy", 2, 1000, 150),
      stat("weak snippet", 2, 1000, 20),
      stat("off page one", 14, 5000, 5),
      stat("tiny", 1, 20, 0),
    ]);
    expect(out.map((r) => r.query)).toEqual(["weak snippet"]);
    expect(out[0].missedClicks).toBeGreaterThan(100);
  });
});

describe("findCannibalization", () => {
  const row = (query: string, page: string, impressions: number) => ({
    query,
    page,
    clicks: 1,
    impressions,
    average_position: 8,
  });

  it("finds queries served by several pages, biggest first", () => {
    const out = findCannibalization([
      row("wheel", "/a", 100),
      row("wheel", "/b", 60),
      row("solo", "/a", 500),
      row("spin", "/a", 40),
      row("spin", "/b", 40),
      row("spin", "/c", 30),
    ]);
    expect(out.map((r) => r.query)).toEqual(["wheel", "spin"]);
    expect(out[0].pages.map((p) => p.page)).toEqual(["/a", "/b"]);
  });

  it("ignores pages with negligible impressions", () => {
    expect(
      findCannibalization([row("q", "/a", 200), row("q", "/b", 3)]),
    ).toEqual([]);
  });
});

describe("findNewPages", () => {
  const day = (n: number) =>
    new Date(Date.parse("2026-06-01T00:00:00Z") + n * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const r = (page: string, n: number, clicks: number, impressions: number) => ({
    page,
    metric_date: day(n),
    clicks,
    impressions,
    average_position: 9,
  });

  it("only returns pages that first appeared after the data began", () => {
    const rows = [
      r("/old", 0, 5, 50),
      r("/old", 20, 5, 50),
      r("/new", 20, 0, 5),
      r("/new", 25, 2, 30),
      r("/new", 29, 3, 40),
    ];
    const out = findNewPages(rows, day(29));
    expect(out.map((p) => p.page)).toEqual(["/new"]);
    expect(out[0].firstSeen).toBe(day(20));
    expect(out[0].daysLive).toBe(9);
    expect(out[0].daysToFirstClick).toBe(5);
    expect(out[0].clicks).toBe(5);
    expect(out[0].recentClicks).toBe(5);
  });

  it("reports a null first-click delay for pages with no clicks yet", () => {
    const out = findNewPages(
      [r("/old", 0, 1, 5), r("/fresh", 25, 0, 4)],
      day(29),
    );
    expect(out[0].daysToFirstClick).toBeNull();
  });
});
