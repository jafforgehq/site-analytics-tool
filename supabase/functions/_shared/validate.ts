// Pure request validation - no Deno/npm imports, so it is unit-testable from
// Vitest. The edge functions import these helpers to validate caller input.

export type SyncSource = "gsc" | "ga4" | "bing";
export type ManualSource = SyncSource | "all";

const SOURCES: ManualSource[] = ["gsc", "ga4", "bing", "all"];

// Accept any well-formed UUID shape (the DB is the real authority on whether a
// row exists). Strict version/variant enforcement wrongly rejected the seed
// ids like 11111111-1111-1111-1111-111111111111.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface ManualSyncInput {
  siteId: string;
  source: ManualSource;
  rangeStart?: string;
  rangeEnd?: string;
}

/** Validate the manual-sync request body. Never trusts external property ids -
 * only a site UUID + a known source are accepted here. */
export function parseManualSyncInput(
  body: unknown,
): ParseResult<ManualSyncInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isUuid(b.siteId)) {
    return { ok: false, error: "siteId must be a valid UUID" };
  }
  if (
    typeof b.source !== "string" ||
    !SOURCES.includes(b.source as ManualSource)
  ) {
    return { ok: false, error: "source must be one of gsc, ga4, bing, all" };
  }

  const range = parseOptionalRange(b.rangeStart, b.rangeEnd);
  if (!range.ok) return range;

  return {
    ok: true,
    value: {
      siteId: b.siteId,
      source: b.source as ManualSource,
      rangeStart: range.value.rangeStart,
      rangeEnd: range.value.rangeEnd,
    },
  };
}

const MAX_RANGE_DAYS = 480; // server-side cap to bound a single invocation

function parseOptionalRange(
  start: unknown,
  end: unknown,
): ParseResult<{ rangeStart?: string; rangeEnd?: string }> {
  if (start == null && end == null) return { ok: true, value: {} };
  if (typeof start !== "string" || typeof end !== "string") {
    return {
      ok: false,
      error: "rangeStart and rangeEnd must be provided together",
    };
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { ok: false, error: "Dates must be YYYY-MM-DD" };
  }
  if (start > end) {
    return { ok: false, error: "rangeStart must be on or before rangeEnd" };
  }
  const spanDays = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (spanDays > MAX_RANGE_DAYS) {
    return { ok: false, error: `Range may not exceed ${MAX_RANGE_DAYS} days` };
  }
  return { ok: true, value: { rangeStart: start, rangeEnd: end } };
}

/** Expand a manual "all" into the concrete sources to run. */
export function expandSources(source: ManualSource): SyncSource[] {
  return source === "all" ? ["gsc", "ga4", "bing"] : [source];
}
