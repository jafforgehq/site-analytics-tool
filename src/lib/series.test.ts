import { describe, expect, it } from "vitest";
import {
  combineAnalyticsAcrossSites,
  combineSearchAcrossSites,
  computeTrajectories,
} from "@/lib/series";
import type { AnalyticsDaily, SearchDaily } from "@/types/database";

function analyticsRow(
  siteId: string,
  date: string,
  overrides: Partial<AnalyticsDaily> = {},
): AnalyticsDaily {
  return {
    site_id: siteId,
    metric_date: date,
    active_users: 0,
    total_users: 0,
    sessions: 0,
    screen_page_views: 0,
    engaged_sessions: 0,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function searchRow(
  siteId: string,
  engine: "google" | "bing",
  date: string,
  overrides: Partial<SearchDaily> = {},
): SearchDaily {
  return {
    site_id: siteId,
    engine,
    metric_date: date,
    clicks: 0,
    impressions: 0,
    ctr: null,
    average_position: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("combineAnalyticsAcrossSites", () => {
  it("sums matching dates across sites", () => {
    const rows = [
      analyticsRow("a", "2026-01-01", { sessions: 10, active_users: 5 }),
      analyticsRow("b", "2026-01-01", { sessions: 20, active_users: 8 }),
      analyticsRow("a", "2026-01-02", { sessions: 7, active_users: 3 }),
    ];
    const combined = combineAnalyticsAcrossSites(rows);
    expect(combined).toHaveLength(2);
    expect(combined[0]).toMatchObject({
      metric_date: "2026-01-01",
      sessions: 30,
      active_users: 13,
    });
    expect(combined[1]).toMatchObject({
      metric_date: "2026-01-02",
      sessions: 7,
      active_users: 3,
    });
  });

  it("sorts by date and returns empty for no rows", () => {
    const rows = [
      analyticsRow("a", "2026-01-03", { sessions: 1 }),
      analyticsRow("a", "2026-01-01", { sessions: 2 }),
    ];
    expect(combineAnalyticsAcrossSites(rows).map((r) => r.metric_date)).toEqual(
      ["2026-01-01", "2026-01-03"],
    );
    expect(combineAnalyticsAcrossSites([])).toEqual([]);
  });
});

describe("combineSearchAcrossSites", () => {
  it("sums clicks/impressions per engine+date and drops ratio fields", () => {
    const rows = [
      searchRow("a", "google", "2026-01-01", {
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        average_position: 5,
      }),
      searchRow("b", "google", "2026-01-01", {
        clicks: 5,
        impressions: 50,
        ctr: 0.1,
        average_position: 8,
      }),
      searchRow("a", "bing", "2026-01-01", { clicks: 2, impressions: 20 }),
    ];
    const combined = combineSearchAcrossSites(rows);
    const google = combined.find((r) => r.engine === "google")!;
    const bing = combined.find((r) => r.engine === "bing")!;
    expect(google).toMatchObject({
      clicks: 15,
      impressions: 150,
      ctr: null,
      average_position: null,
    });
    expect(bing).toMatchObject({ clicks: 2, impressions: 20 });
  });

  it("keeps engines separate on the same date", () => {
    const rows = [
      searchRow("a", "google", "2026-01-01", { clicks: 10 }),
      searchRow("a", "bing", "2026-01-01", { clicks: 3 }),
    ];
    expect(combineSearchAcrossSites(rows)).toHaveLength(2);
  });
});

describe("computeTrajectories", () => {
  const DAYS = 30;
  const analytics = Array.from({ length: DAYS }, (_, i) =>
    analyticsRow("a", `2026-01-${String(i + 1).padStart(2, "0")}`, {
      sessions: 100 + i,
      active_users: 50,
      screen_page_views: 200,
      engaged_sessions: 60,
    }),
  );
  const search = Array.from({ length: DAYS }, (_, i) =>
    searchRow("a", "google", `2026-01-${String(i + 1).padStart(2, "0")}`, {
      clicks: 20 + i,
      impressions: 400,
    }),
  );

  it("returns an entry for every defined metric, including unused ones", () => {
    const results = computeTrajectories(analytics, search, 14);
    const keys = results.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "sessions",
        "active_users",
        "screen_page_views",
        "engaged_sessions",
        "google_clicks",
        "google_impressions",
        "bing_clicks",
        "bing_impressions",
      ]),
    );
  });

  it("forecasts metrics with enough history and leaves unused engines empty", () => {
    const results = computeTrajectories(analytics, search, 14);
    const sessions = results.find((r) => r.key === "sessions")!;
    const googleClicks = results.find((r) => r.key === "google_clicks")!;
    const bingClicks = results.find((r) => r.key === "bing_clicks")!;

    expect(sessions.forecast).not.toBeNull();
    expect(googleClicks.forecast).not.toBeNull();
    expect(bingClicks.series).toEqual([]);
    expect(bingClicks.forecast).toBeNull();
  });

  it("returns null forecasts for every metric on empty input", () => {
    const results = computeTrajectories([], [], 14);
    expect(results.every((r) => r.forecast === null)).toBe(true);
  });
});
