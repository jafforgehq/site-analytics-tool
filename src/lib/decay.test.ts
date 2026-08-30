import { describe, expect, it } from "vitest";
import { computeDecayingPages, type PageDailyRow } from "@/lib/decay";

const TODAY = "2026-08-30";

/** Rows spread evenly across a window: `perDay` clicks on each of `days`. */
function pageRows(
  page: string,
  dailyClicks: { recent: number; prior: number },
  position?: { recent: number; prior: number },
): PageDailyRow[] {
  const rows: PageDailyRow[] = [];
  for (let i = 0; i < 56; i += 1) {
    const t = Date.parse(`${TODAY}T00:00:00Z`) - i * 86_400_000;
    const date = new Date(t).toISOString().slice(0, 10);
    const recent = i < 28;
    rows.push({
      page,
      metric_date: date,
      clicks: recent ? dailyClicks.recent : dailyClicks.prior,
      impressions: 100,
      average_position: position
        ? recent
          ? position.recent
          : position.prior
        : null,
    });
  }
  return rows;
}

describe("computeDecayingPages", () => {
  it("flags a page that lost a large share of clicks", () => {
    const rows = pageRows("/fading-guide", { recent: 2, prior: 10 });
    const decays = computeDecayingPages(rows, 28, TODAY);
    expect(decays).toHaveLength(1);
    expect(decays[0].page).toBe("/fading-guide");
    expect(decays[0].previousClicks).toBe(280);
    expect(decays[0].currentClicks).toBe(56);
    expect(decays[0].changePct).toBeCloseTo(-80, 0);
  });

  it("ignores stable and growing pages", () => {
    const rows = [
      ...pageRows("/stable", { recent: 10, prior: 10 }),
      ...pageRows("/growing", { recent: 20, prior: 10 }),
    ];
    expect(computeDecayingPages(rows, 28, TODAY)).toHaveLength(0);
  });

  it("ignores pages with too little baseline traffic", () => {
    // 0.25/day prior → 7 clicks total, under the 10-click floor.
    const rows: PageDailyRow[] = pageRows("/tiny", {
      recent: 0,
      prior: 0,
    }).map((r, i) => ({ ...r, clicks: i >= 28 && i < 35 ? 1 : 0 }));
    expect(computeDecayingPages(rows, 28, TODAY)).toHaveLength(0);
  });

  it("treats a page absent from the recent window as fully decayed", () => {
    const rows = pageRows("/vanished", { recent: 0, prior: 8 }).filter(
      (r) => r.clicks > 0,
    );
    const decays = computeDecayingPages(rows, 28, TODAY);
    expect(decays).toHaveLength(1);
    expect(decays[0].currentClicks).toBe(0);
    expect(decays[0].changePct).toBe(-100);
  });

  it("ranks a big page's partial drop above a tiny page's total drop", () => {
    const rows = [
      ...pageRows("/big-drop", { recent: 20, prior: 50 }), // -60%, lost 840
      ...pageRows("/small-vanish", { recent: 0, prior: 1 }), // -100%, lost 28
    ];
    const decays = computeDecayingPages(rows, 28, TODAY);
    expect(decays.map((d) => d.page)).toEqual(["/big-drop", "/small-vanish"]);
  });

  it("reports impressions-weighted positions per window", () => {
    const rows = pageRows(
      "/slipping",
      { recent: 3, prior: 10 },
      { recent: 18, prior: 6 },
    );
    const decays = computeDecayingPages(rows, 28, TODAY);
    expect(decays[0].currentPosition).toBeCloseTo(18, 5);
    expect(decays[0].previousPosition).toBeCloseTo(6, 5);
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      pageRows(`/page-${i}`, { recent: 1, prior: 10 }),
    ).flat();
    expect(computeDecayingPages(rows, 28, TODAY, 5)).toHaveLength(5);
  });
});
