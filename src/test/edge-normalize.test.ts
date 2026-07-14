import { describe, expect, it } from "vitest";
import {
  ga4DateToIso,
  normalizeGa4Rows,
  normalizeGscRows,
  type Ga4Report,
} from "../../supabase/functions/_shared/normalize";
import {
  defaultRange,
  utcDateMinus,
} from "../../supabase/functions/_shared/range";

const UPDATED = "2026-06-21T00:00:00.000Z";
const SITE = "site-1";

describe("ga4DateToIso", () => {
  it("converts compact GA4 dates", () => {
    expect(ga4DateToIso("20260621")).toBe("2026-06-21");
  });
  it("throws on an unexpected format", () => {
    expect(() => ga4DateToIso("2026-06-21")).toThrow();
  });
});

describe("normalizeGscRows", () => {
  it("maps fields and keeps null ctr/position as null", () => {
    const rows = normalizeGscRows(
      [
        {
          keys: ["2026-06-20"],
          clicks: 5,
          impressions: 100,
          ctr: 0.05,
          position: 7.2,
        },
      ],
      SITE,
      UPDATED,
    );
    expect(rows[0]).toMatchObject({
      site_id: SITE,
      engine: "google",
      metric_date: "2026-06-20",
      clicks: 5,
      impressions: 100,
      ctr: 0.05,
      average_position: 7.2,
    });
  });

  it("drops rows without a valid date", () => {
    expect(normalizeGscRows([{ keys: ["nope"] }], SITE, UPDATED)).toHaveLength(
      0,
    );
  });

  it("handles an undefined rows array", () => {
    expect(normalizeGscRows(undefined, SITE, UPDATED)).toEqual([]);
  });
});

describe("normalizeGa4Rows", () => {
  const report: Ga4Report = {
    metricHeaders: [
      { name: "activeUsers" },
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "engagedSessions" },
    ],
    rows: [
      {
        dimensionValues: [{ value: "20260620" }],
        metricValues: [
          { value: "10" },
          { value: "12" },
          { value: "15" },
          { value: "40" },
          { value: "9" },
        ],
      },
    ],
  };

  it("reads metrics by header name and normalizes the date", () => {
    const rows = normalizeGa4Rows(report, SITE, UPDATED);
    expect(rows[0]).toMatchObject({
      metric_date: "2026-06-20",
      active_users: 10,
      total_users: 12,
      sessions: 15,
      screen_page_views: 40,
      engaged_sessions: 9,
    });
  });

  it("is resilient to reordered metric headers", () => {
    const reordered: Ga4Report = {
      metricHeaders: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "engagedSessions" },
      ],
      rows: [
        {
          dimensionValues: [{ value: "20260620" }],
          metricValues: [
            { value: "15" }, // sessions
            { value: "10" }, // activeUsers
            { value: "12" },
            { value: "40" },
            { value: "9" },
          ],
        },
      ],
    };
    const rows = normalizeGa4Rows(reordered, SITE, UPDATED);
    expect(rows[0].active_users).toBe(10);
    expect(rows[0].sessions).toBe(15);
  });

  it("throws if a required metric header is missing", () => {
    expect(() =>
      normalizeGa4Rows(
        { metricHeaders: [{ name: "activeUsers" }], rows: [] },
        SITE,
        UPDATED,
      ),
    ).toThrow(/Missing GA4 metric/);
  });
});

describe("date range helpers", () => {
  const ref = new Date("2026-06-21T12:00:00Z");
  it("computes a UTC date minus N days", () => {
    expect(utcDateMinus(1, ref)).toBe("2026-06-20");
    expect(utcDateMinus(10, ref)).toBe("2026-06-11");
  });
  it("builds a rolling window ending yesterday", () => {
    expect(defaultRange(7, ref)).toEqual({
      startDate: "2026-06-14",
      endDate: "2026-06-20",
    });
  });
});
