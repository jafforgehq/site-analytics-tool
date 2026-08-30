// Pure request validation for the manage-portfolio Edge Function - no Deno or
// npm imports, so it is unit-testable from Vitest (see src/test/).
//
// Server-side caps bound every table this function can write to, so a
// compromised-but-authenticated browser session cannot bloat the database.

import { isUuid, type ParseResult } from "./validate.ts";

/** Server-side row cap (enforced again by the function before insert). */
export const MAX_TRACKED_QUERIES_PER_SITE = 20;

export interface TrackedQueryInput {
  siteId: string;
  query: string;
}

export function parseTrackedQueryInput(
  body: unknown,
): ParseResult<TrackedQueryInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isUuid(b.siteId)) {
    return { ok: false, error: "siteId must be a valid UUID" };
  }
  const query = typeof b.query === "string" ? b.query.trim() : "";
  if (query.length < 1 || query.length > 200) {
    return { ok: false, error: "query must be 1-200 characters" };
  }

  return { ok: true, value: { siteId: b.siteId, query } };
}
