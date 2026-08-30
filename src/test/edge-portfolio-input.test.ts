import { describe, expect, it } from "vitest";
import { parseTrackedQueryInput } from "../../supabase/functions/_shared/portfolio-input";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseTrackedQueryInput", () => {
  it("accepts and trims a query", () => {
    const r = parseTrackedQueryInput({ siteId: UUID, query: " best hikes " });
    expect(r).toEqual({
      ok: true,
      value: { siteId: UUID, query: "best hikes" },
    });
  });

  it("rejects empty and oversized queries and bad uuids", () => {
    expect(parseTrackedQueryInput({ siteId: UUID, query: "" }).ok).toBe(false);
    expect(
      parseTrackedQueryInput({ siteId: UUID, query: "q".repeat(201) }).ok,
    ).toBe(false);
    expect(parseTrackedQueryInput({ siteId: "x", query: "ok" }).ok).toBe(false);
  });
});
