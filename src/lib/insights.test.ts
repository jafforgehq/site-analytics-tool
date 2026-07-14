import { describe, expect, it } from "vitest";
import { computeInsights } from "@/lib/insights";
import type {
  AnalyticsDaily,
  IntegrationStatus,
  SearchDaily,
  Site,
} from "@/types/database";

const NOW = new Date("2026-06-21T12:00:00Z");

function site(id: string, name: string): Site {
  return {
    id,
    name,
    domain: `${name.toLowerCase()}.com`,
    website_url: `https://${name.toLowerCase()}.com`,
    gsc_property: `sc-domain:${name.toLowerCase()}.com`,
    ga4_property_id: "1",
    bing_site_url: null,
    is_active: true,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function status(
  siteId: string,
  source: "gsc" | "ga4" | "bing",
): IntegrationStatus {
  return {
    site_id: siteId,
    source,
    enabled: source !== "bing",
    last_attempt_at: "2026-06-21T04:00:00Z",
    last_success_at: "2026-06-21T04:00:00Z",
    last_status: "success",
    last_duration_ms: 1000,
    last_rows_fetched: 5,
    last_rows_written: 5,
    consecutive_failures: 0,
    last_error_code: null,
    last_error_message: null,
    next_run_at: null,
    stale_after_hours: 36,
    updated_at: NOW.toISOString(),
  };
}

// 4 days of search rows: previous period (days -4,-3) then current (-2,-1)
function search(siteId: string, clicks: number[]): SearchDaily[] {
  return clicks.map((c, i) => ({
    site_id: siteId,
    engine: "google" as const,
    metric_date: `2026-06-${String(17 + i).padStart(2, "0")}`,
    clicks: c,
    impressions: c * 20,
    ctr: 0.05,
    average_position: 8,
    updated_at: NOW.toISOString(),
  }));
}

describe("computeInsights", () => {
  it("rolls up portfolio KPIs across sites", () => {
    const s1 = site("a1111111-1111-1111-1111-111111111111", "Alpha");
    const result = computeInsights({
      sites: [s1],
      statuses: [status(s1.id, "gsc"), status(s1.id, "ga4")],
      analytics: [],
      search: search(s1.id, [10, 10, 20, 20]), // prev 20, current 40
      days: 2,
      now: NOW,
    });
    expect(result.kpis.clicks.current).toBe(40);
    expect(result.kpis.clicks.previous).toBe(20);
    expect(result.kpis.clicks.pct).toBe(100);
  });

  it("surfaces a big decliner as a warning insight", () => {
    const s1 = site("a1111111-1111-1111-1111-111111111111", "Alpha");
    const result = computeInsights({
      sites: [s1],
      statuses: [status(s1.id, "gsc"), status(s1.id, "ga4")],
      analytics: [],
      search: search(s1.id, [50, 50, 10, 10]), // prev 100, current 20 → -80%
      days: 2,
      now: NOW,
    });
    const decline = result.insights.find((i) => i.id.startsWith("decline-"));
    expect(decline).toBeTruthy();
    expect(decline?.severity).toBe("warning");
  });

  it("flags a critical integration in the feed", () => {
    const s1 = site("a1111111-1111-1111-1111-111111111111", "Alpha");
    const bad = status(s1.id, "ga4");
    bad.consecutive_failures = 3;
    bad.last_status = "failed";
    const result = computeInsights({
      sites: [s1],
      statuses: [status(s1.id, "gsc"), bad],
      analytics: [],
      search: search(s1.id, [10, 10, 10, 10]),
      days: 2,
      now: NOW,
    });
    expect(result.health.critical).toBeGreaterThanOrEqual(1);
    expect(result.insights.some((i) => i.severity === "critical")).toBe(true);
  });

  it("excludes inactive sites", () => {
    const s1 = site("a1111111-1111-1111-1111-111111111111", "Alpha");
    s1.is_active = false;
    const result = computeInsights({
      sites: [s1],
      statuses: [status(s1.id, "gsc")],
      analytics: [] as AnalyticsDaily[],
      search: [],
      days: 2,
      now: NOW,
    });
    expect(result.sites).toHaveLength(0);
  });
});
