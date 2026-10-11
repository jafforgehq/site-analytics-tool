// Pure PageSpeed Insights v5 response extraction - no Deno/npm imports.

export interface VitalsExtract {
  performance_score: number | null;
  lcp_ms: number | null;
  inp_ms: number | null;
  cls: number | null;
  field_data: boolean;
  field_category: string | null;
}

type Obj = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function obj(v: unknown): Obj | undefined {
  return typeof v === "object" && v !== null ? (v as Obj) : undefined;
}

export function extractVitals(body: unknown): VitalsExtract {
  const root = obj(body);
  const lighthouse = obj(root?.lighthouseResult);
  const score = num(obj(obj(lighthouse?.categories)?.performance)?.score);
  const audits = obj(lighthouse?.audits);
  const experience = obj(root?.loadingExperience);
  const metrics = obj(experience?.metrics);

  const p75 = (name: string) => num(obj(metrics?.[name])?.percentile);
  const fieldLcp = p75("LARGEST_CONTENTFUL_PAINT_MS");
  const fieldInp = p75("INTERACTION_TO_NEXT_PAINT");
  // PSI names it ..._SCORE; accept the bare name too.
  const fieldClsRaw =
    p75("CUMULATIVE_LAYOUT_SHIFT_SCORE") ?? p75("CUMULATIVE_LAYOUT_SHIFT");
  const fieldCls = fieldClsRaw === null ? null : fieldClsRaw / 100; // CrUX reports CLS x100

  const fieldData = fieldLcp !== null || fieldInp !== null || fieldCls !== null;
  const category = experience?.overall_category;

  const labLcp = num(obj(audits?.["largest-contentful-paint"])?.numericValue);
  const labCls = num(obj(audits?.["cumulative-layout-shift"])?.numericValue);

  return {
    performance_score: score,
    lcp_ms: fieldLcp ?? labLcp,
    inp_ms: fieldInp,
    cls: fieldCls ?? labCls,
    field_data: fieldData,
    field_category:
      fieldData && typeof category === "string" && category ? category : null,
  };
}
