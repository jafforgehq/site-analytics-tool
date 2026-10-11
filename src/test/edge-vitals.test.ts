import { describe, expect, it } from "vitest";
import { extractVitals } from "../../supabase/functions/_shared/vitals";

const lighthouseResult = {
  categories: { performance: { score: 0.82 } },
  audits: {
    "largest-contentful-paint": { numericValue: 3100.5 },
    "cumulative-layout-shift": { numericValue: 0.07 },
  },
};

describe("extractVitals", () => {
  it("prefers field data; CrUX CLS is divided by 100", () => {
    const out = extractVitals({
      lighthouseResult,
      loadingExperience: {
        overall_category: "AVERAGE",
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400 },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12 },
        },
      },
    });
    expect(out).toEqual({
      performance_score: 0.82,
      lcp_ms: 2400,
      inp_ms: 180,
      cls: 0.12,
      field_data: true,
      field_category: "AVERAGE",
    });
  });

  it("falls back to lab audits when there is no field data", () => {
    const out = extractVitals({ lighthouseResult });
    expect(out).toEqual({
      performance_score: 0.82,
      lcp_ms: 3100.5,
      inp_ms: null,
      cls: 0.07,
      field_data: false,
      field_category: null,
    });
  });

  it("accepts the bare CUMULATIVE_LAYOUT_SHIFT metric name", () => {
    const out = extractVitals({
      loadingExperience: {
        metrics: { CUMULATIVE_LAYOUT_SHIFT: { percentile: 5 } },
      },
    });
    expect(out.cls).toBe(0.05);
  });

  it("returns nulls for empty or malformed input", () => {
    for (const body of [{}, null, "x", { lighthouseResult: { audits: 1 } }]) {
      expect(extractVitals(body)).toEqual({
        performance_score: null,
        lcp_ms: null,
        inp_ms: null,
        cls: null,
        field_data: false,
        field_category: null,
      });
    }
  });
});
