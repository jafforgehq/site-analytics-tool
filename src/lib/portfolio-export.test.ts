import { describe, expect, it } from "vitest";
import { buildExportComputed } from "@/lib/portfolio-export";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  SearchPageDaily,
  Site,
} from "@/types/database";

const NOW = new Date("2026-08-30T12:00:00Z");

function site(id: string, name: string, isActive = true): Site {
  return {
    id,
    name,
    domain: `${name.toLowerCase()}.example`,
    website_url: `https://${name.toLowerCase()}.example`,
    gsc_property: `sc-domain:${name.toLowerCase()}.example`,
    ga4_property_id: "123",
    bing_site_url: null,
    is_active: isActive,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function analyticsRow(
  siteId: string,
  date: string,
  sessions: number,
): AnalyticsDaily {
  return {
    site_id: siteId,
    metric_date: date,
    active_users: sessions,
    total_users: sessions,
    sessions,
    screen_page_views: sessions * 2,
    engaged_sessions: Math.round(sessions * 0.6),
    updated_at: NOW.toISOString(),
  };
}

function searchRow(siteId: string, date: string, clicks: number): SearchDaily {
  return {
    site_id: siteId,
    engine: "google",
    metric_date: date,
    clicks,
    impressions: clicks * 10,
    ctr: null,
    average_position: null,
    updated_at: NOW.toISOString(),
  };
}

function dateAt(daysAgo: number): string {
  const t = NOW.getTime() - daysAgo * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

describe("buildExportComputed", () => {
  const sites = [site("a", "Aurora"), site("b", "Borealis")];
  const statuses: IntegrationStatus[] = [];

  // 40 days of rising history for both sites, so trajectories forecast and
  // insights have a full comparison window.
  const analytics: AnalyticsDaily[] = [
    ...Array.from({ length: 40 }, (_, i) =>
      analyticsRow("a", dateAt(39 - i), 100 + i),
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      analyticsRow("b", dateAt(39 - i), 50 + i),
    ),
  ];
  const search: SearchDaily[] = [
    ...Array.from({ length: 40 }, (_, i) =>
      searchRow("a", dateAt(39 - i), 20 + i),
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      searchRow("b", dateAt(39 - i), 10 + i),
    ),
  ];

  it("computes insights for all three windows", () => {
    const result = buildExportComputed({
      sites,
      statuses,
      analytics,
      search,
      searchPage: [],
      now: NOW,
    });
    expect(Object.keys(result.insights).sort()).toEqual(["180", "30", "90"]);
    expect(result.insights["30"].sites).toHaveLength(2);
  });

  it("sums both sites into the portfolio trajectory", () => {
    const result = buildExportComputed({
      sites,
      statuses,
      analytics,
      search,
      searchPage: [],
      now: NOW,
    });
    const sessions = result.portfolio_trajectory.find(
      (t) => t.key === "sessions",
    )!;
    expect(sessions.forecast).not.toBeNull();
    expect(sessions.forecast!.method).toBeDefined();
    // Trimmed - no raw observed series should leak into the export.
    expect(sessions).not.toHaveProperty("series");
  });

  it("computes a separate trajectory per active site, skipping inactive ones", () => {
    const result = buildExportComputed({
      sites: [...sites, site("c", "Cinder", false)],
      statuses,
      analytics,
      search,
      searchPage: [],
      now: NOW,
    });
    expect(result.site_trajectories.map((t) => t.site_id).sort()).toEqual([
      "a",
      "b",
    ]);
    const aurora = result.site_trajectories.find((t) => t.site_id === "a")!;
    expect(aurora.site_name).toBe("Aurora");
    expect(
      aurora.trajectories.find((t) => t.key === "sessions")!.forecast,
    ).not.toBeNull();
  });

  it("computes a refresh queue from page-level rows across active sites", () => {
    const searchPage: SearchPageDaily[] = [
      ...Array.from({ length: 56 }, (_, i) => ({
        site_id: "a",
        engine: "google" as const,
        metric_date: dateAt(55 - i),
        page: "/fading",
        clicks: i < 28 ? 20 : 2,
        impressions: 100,
        ctr: null,
        average_position: null,
        updated_at: NOW.toISOString(),
      })),
    ];
    const result = buildExportComputed({
      sites,
      statuses,
      analytics,
      search,
      searchPage,
      now: NOW,
    });
    expect(result.refresh_queue).toHaveLength(1);
    expect(result.refresh_queue[0]).toMatchObject({
      page: "/fading",
      siteId: "a",
      siteName: "Aurora",
    });
  });
});
