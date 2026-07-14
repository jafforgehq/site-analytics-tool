import { describe, expect, it } from "vitest";
import {
  normalizeBingRows,
  parseMicrosoftDate,
} from "../../supabase/functions/_shared/bing-parse";

const SITE = "site-1";
const UPDATED = "2026-06-21T00:00:00.000Z";

describe("parseMicrosoftDate", () => {
  it("parses Microsoft JSON dates with an offset", () => {
    // 1718841600000 ms = 2024-06-20T00:00:00Z
    expect(parseMicrosoftDate("/Date(1718841600000+0000)/")).toBe("2024-06-20");
  });
  it("parses Microsoft JSON dates without an offset", () => {
    expect(parseMicrosoftDate("/Date(1718841600000)/")).toBe("2024-06-20");
  });
  it("tolerates a plain ISO date", () => {
    expect(parseMicrosoftDate("2026-06-20")).toBe("2026-06-20");
  });
  it("returns null for junk or non-strings", () => {
    expect(parseMicrosoftDate("not a date")).toBeNull();
    expect(parseMicrosoftDate(12345)).toBeNull();
    expect(parseMicrosoftDate(undefined)).toBeNull();
  });
});

describe("normalizeBingRows", () => {
  it("maps clicks/impressions and leaves ctr/position null", () => {
    const rows = normalizeBingRows(
      [{ Date: "/Date(1718841600000+0000)/", Clicks: 12, Impressions: 340 }],
      SITE,
      UPDATED,
    );
    expect(rows[0]).toEqual({
      site_id: SITE,
      engine: "bing",
      metric_date: "2024-06-20",
      clicks: 12,
      impressions: 340,
      ctr: null,
      average_position: null,
      updated_at: UPDATED,
    });
  });

  it("drops rows with an unparseable date", () => {
    const rows = normalizeBingRows(
      [{ Date: "bad", Clicks: 1, Impressions: 2 }],
      SITE,
      UPDATED,
    );
    expect(rows).toHaveLength(0);
  });

  it("dedupes by date so an upsert can't hit a row twice", () => {
    const rows = normalizeBingRows(
      [
        { Date: "/Date(1718841600000)/", Clicks: 1, Impressions: 10 },
        { Date: "/Date(1718841600000)/", Clicks: 5, Impressions: 50 },
      ],
      SITE,
      UPDATED,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].clicks).toBe(5); // last write wins
  });

  it("caps an unreasonable payload", () => {
    const many: { Date: string; Clicks: number; Impressions: number }[] = [];
    for (let i = 0; i < 50; i++) {
      // distinct days so dedupe keeps them all
      const ms = 1718841600000 + i * 86_400_000;
      many.push({ Date: `/Date(${ms})/`, Clicks: i, Impressions: i });
    }
    expect(normalizeBingRows(many, SITE, UPDATED, 10)).toHaveLength(10);
  });

  it("handles an undefined array", () => {
    expect(normalizeBingRows(undefined, SITE, UPDATED)).toEqual([]);
  });
});
