import { describe, expect, it } from "vitest";
import {
  parseAnnotationInput,
  parseGoalInput,
  parseTrackedQueryInput,
} from "../../supabase/functions/_shared/portfolio-input";

const UUID = "11111111-1111-4111-8111-111111111111";
const TODAY = "2026-08-30";

describe("parseGoalInput", () => {
  const valid = {
    siteId: UUID,
    metric: "clicks",
    targetValue: 10_000,
    targetDate: "2026-12-01",
  };

  it("accepts a valid goal and trims the note", () => {
    const r = parseGoalInput({ ...valid, note: "  stretch  " }, TODAY);
    expect(r).toEqual({
      ok: true,
      value: {
        siteId: UUID,
        metric: "clicks",
        targetValue: 10_000,
        targetDate: "2026-12-01",
        note: "stretch",
      },
    });
  });

  it("normalizes a missing/empty note to null", () => {
    const r = parseGoalInput(valid, TODAY);
    expect(r.ok && r.value.note).toBeNull();
  });

  it("rejects unknown metrics", () => {
    expect(parseGoalInput({ ...valid, metric: "revenue" }, TODAY).ok).toBe(
      false,
    );
  });

  it("rejects non-integer, zero, and oversized targets", () => {
    expect(parseGoalInput({ ...valid, targetValue: 0 }, TODAY).ok).toBe(false);
    expect(parseGoalInput({ ...valid, targetValue: 1.5 }, TODAY).ok).toBe(
      false,
    );
    expect(parseGoalInput({ ...valid, targetValue: 2e9 }, TODAY).ok).toBe(
      false,
    );
  });

  it("rejects past, same-day, and far-future target dates", () => {
    expect(
      parseGoalInput({ ...valid, targetDate: "2026-08-30" }, TODAY).ok,
    ).toBe(false);
    expect(
      parseGoalInput({ ...valid, targetDate: "2025-01-01" }, TODAY).ok,
    ).toBe(false);
    expect(
      parseGoalInput({ ...valid, targetDate: "2029-01-01" }, TODAY).ok,
    ).toBe(false);
  });

  it("rejects a bad uuid and an oversized note", () => {
    expect(parseGoalInput({ ...valid, siteId: "nope" }, TODAY).ok).toBe(false);
    expect(parseGoalInput({ ...valid, note: "x".repeat(201) }, TODAY).ok).toBe(
      false,
    );
  });
});

describe("parseAnnotationInput", () => {
  const valid = { siteId: UUID, eventDate: "2026-08-01", label: "Relaunch" };

  it("accepts a site-scoped annotation with default kind", () => {
    const r = parseAnnotationInput(valid);
    expect(r).toEqual({
      ok: true,
      value: {
        siteId: UUID,
        eventDate: "2026-08-01",
        label: "Relaunch",
        kind: "other",
      },
    });
  });

  it("accepts a portfolio-wide annotation (null siteId)", () => {
    const r = parseAnnotationInput({ ...valid, siteId: null, kind: "seo" });
    expect(r.ok && r.value.siteId).toBeNull();
    expect(r.ok && r.value.kind).toBe("seo");
  });

  it("rejects empty and oversized labels", () => {
    expect(parseAnnotationInput({ ...valid, label: "   " }).ok).toBe(false);
    expect(parseAnnotationInput({ ...valid, label: "x".repeat(81) }).ok).toBe(
      false,
    );
  });

  it("rejects unknown kinds and malformed dates", () => {
    expect(parseAnnotationInput({ ...valid, kind: "party" }).ok).toBe(false);
    expect(parseAnnotationInput({ ...valid, eventDate: "Aug 1" }).ok).toBe(
      false,
    );
  });
});

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
