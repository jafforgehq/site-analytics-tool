import { describe, expect, it } from "vitest";
import {
  buildDigest,
  detectAlerts,
  detectIndexingIssue,
  detectSiteDown,
  detectSyncFailing,
  detectTrafficDrop,
  isoWeek,
  type DailyClicks,
} from "../../supabase/functions/_shared/alerts";

const site = { id: "s1", name: "Acme" };
// Sunday 2026-10-11 -> last complete day is Sat 2026-10-10 (ISO 2026-W41).
const now = new Date("2026-10-11T06:00:00Z");

/** 7 current days (10-04..10-10) and 7 previous days (09-27..10-03). */
function series(prevTotal: number, curTotal: number): DailyClicks[] {
  const rows: DailyClicks[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(Date.UTC(2026, 9, 4 + i)).toISOString().slice(0, 10);
    const prev = new Date(Date.UTC(2026, 8, 27 + i)).toISOString().slice(0, 10);
    rows.push({ metric_date: cur, clicks: curTotal / 7 });
    rows.push({ metric_date: prev, clicks: prevTotal / 7 });
  }
  return rows;
}

describe("isoWeek", () => {
  it("handles week boundaries and year edges", () => {
    expect(isoWeek("2026-10-10")).toBe("2026-W41");
    expect(isoWeek("2026-10-11")).toBe("2026-W41"); // Sunday
    expect(isoWeek("2026-10-12")).toBe("2026-W42"); // Monday
    expect(isoWeek("2021-01-03")).toBe("2020-W53");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
  });
});

describe("detectTrafficDrop", () => {
  it("warns at >=30% drop", () => {
    const a = detectTrafficDrop(site, series(700, 455), now);
    expect(a?.severity).toBe("warning");
    expect(a?.dedupe_key).toBe("traffic_drop:s1:2026-W41");
  });
  it("is critical at >=50%", () => {
    expect(detectTrafficDrop(site, series(700, 280), now)?.severity).toBe(
      "critical",
    );
  });
  it("ignores smaller drops, growth and tiny baselines", () => {
    expect(detectTrafficDrop(site, series(700, 560), now)).toBeNull();
    expect(detectTrafficDrop(site, series(700, 900), now)).toBeNull();
    expect(detectTrafficDrop(site, series(49, 0), now)).toBeNull();
  });
  it("triggers exactly at the 30% and 50 click boundaries", () => {
    expect(detectTrafficDrop(site, series(70, 49), now)).not.toBeNull();
    expect(detectTrafficDrop(site, series(70, 50), now)).toBeNull();
    expect(detectTrafficDrop(site, series(50, 0), now)?.severity).toBe(
      "critical",
    );
  });
  it("ignores rows outside both windows (incl. today)", () => {
    const rows = [
      ...series(700, 700),
      { metric_date: "2026-10-11", clicks: 0 },
      { metric_date: "2026-09-01", clicks: 99999 },
    ];
    expect(detectTrafficDrop(site, rows, now)).toBeNull();
  });
});

describe("detectSiteDown", () => {
  const down = (t: string) => ({ checked_at: t, ok: false });
  it("fires when the latest 2 checks failed, regardless of order", () => {
    const a = detectSiteDown(
      site,
      [
        { checked_at: "2026-10-11T01:00:00Z", ok: true },
        down("2026-10-11T05:00:00Z"),
        down("2026-10-11T04:00:00Z"),
      ],
      now,
    );
    expect(a?.severity).toBe("critical");
    expect(a?.dedupe_key).toBe("site_down:s1:2026-10-11");
  });
  it("needs two checks and both failing", () => {
    expect(
      detectSiteDown(site, [down("2026-10-11T05:00:00Z")], now),
    ).toBeNull();
    expect(
      detectSiteDown(
        site,
        [
          down("2026-10-11T05:00:00Z"),
          { checked_at: "2026-10-11T04:00:00Z", ok: true },
        ],
        now,
      ),
    ).toBeNull();
    expect(detectSiteDown(site, [], now)).toBeNull();
  });
});

describe("detectSyncFailing", () => {
  it("alerts per enabled source at >=3 failures", () => {
    const out = detectSyncFailing(
      site,
      [
        { source: "gsc", enabled: true, consecutive_failures: 3 },
        { source: "ga4", enabled: true, consecutive_failures: 2 },
        { source: "bing", enabled: false, consecutive_failures: 9 },
      ],
      now,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].dedupe_key).toBe("sync_failing:s1:gsc:2026-10-11");
  });
});

describe("detectIndexingIssue", () => {
  const bad = {
    verdict: "NEUTRAL",
    coverage_state: "Crawled - currently not indexed",
  };
  it("is info-level at >=5 non-indexed URLs", () => {
    const rows = [
      bad,
      bad,
      { verdict: "FAIL", coverage_state: null },
      {
        verdict: "NEUTRAL",
        coverage_state: "Discovered - currently not indexed",
      },
      {
        verdict: "PASS",
        coverage_state: "Crawled - currently not indexed (x)",
      },
      { verdict: "PASS", coverage_state: "Submitted and indexed" },
    ];
    const a = detectIndexingIssue(site, rows, now);
    expect(a?.severity).toBe("info");
    expect(a?.dedupe_key).toBe("indexing_issue:s1:2026-W41");
  });
  it("stays quiet below the threshold", () => {
    expect(detectIndexingIssue(site, [bad, bad, bad, bad], now)).toBeNull();
  });
});

describe("detectAlerts / buildDigest", () => {
  it("combines detectors and builds an escaped digest", () => {
    const alerts = detectAlerts(
      {
        site: { id: "s1", name: "<b>Acme</b>" },
        googleClicks: series(700, 100),
        uptime: [
          { checked_at: "2026-10-11T05:00:00Z", ok: false },
          { checked_at: "2026-10-11T04:00:00Z", ok: false },
        ],
        integrations: [],
        inspections: [],
      },
      now,
    );
    expect(alerts.map((a) => a.kind).sort()).toEqual([
      "site_down",
      "traffic_drop",
    ]);
    const d = buildDigest(alerts);
    expect(d.subject).toContain("2 new alerts");
    expect(d.subject).toContain("critical");
    expect(d.html).not.toContain("<b>Acme");
    expect(d.html).toContain("&lt;b&gt;Acme");
  });
});
