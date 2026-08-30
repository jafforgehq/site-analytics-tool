// Pure request validation for the manage-portfolio Edge Function - no Deno or
// npm imports, so it is unit-testable from Vitest (see src/test/).
//
// Server-side caps bound every table this function can write to, so a
// compromised-but-authenticated browser session cannot bloat the database.

import { isUuid, type ParseResult } from "./validate.ts";

export const GOAL_METRICS = ["sessions", "clicks"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const ANNOTATION_KINDS = ["deploy", "content", "seo", "other"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** Server-side row caps (enforced again by the function before insert). */
export const MAX_GOALS_PER_SITE = 10;
export const MAX_ANNOTATIONS = 500;
export const MAX_TRACKED_QUERIES_PER_SITE = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TARGET_VALUE = 1_000_000_000;
const MAX_GOAL_HORIZON_DAYS = 730;

export interface GoalInput {
  siteId: string;
  metric: GoalMetric;
  targetValue: number;
  targetDate: string;
  note: string | null;
}

export function parseGoalInput(
  body: unknown,
  today: string,
): ParseResult<GoalInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isUuid(b.siteId)) {
    return { ok: false, error: "siteId must be a valid UUID" };
  }
  if (
    typeof b.metric !== "string" ||
    !GOAL_METRICS.includes(b.metric as GoalMetric)
  ) {
    return { ok: false, error: "metric must be one of sessions, clicks" };
  }
  if (
    typeof b.targetValue !== "number" ||
    !Number.isInteger(b.targetValue) ||
    b.targetValue <= 0 ||
    b.targetValue > MAX_TARGET_VALUE
  ) {
    return {
      ok: false,
      error: `targetValue must be a positive integer up to ${MAX_TARGET_VALUE}`,
    };
  }
  if (typeof b.targetDate !== "string" || !DATE_RE.test(b.targetDate)) {
    return { ok: false, error: "targetDate must be YYYY-MM-DD" };
  }
  if (b.targetDate <= today) {
    return { ok: false, error: "targetDate must be in the future" };
  }
  const horizon = (Date.parse(b.targetDate) - Date.parse(today)) / 86_400_000;
  if (horizon > MAX_GOAL_HORIZON_DAYS) {
    return {
      ok: false,
      error: `targetDate may be at most ${MAX_GOAL_HORIZON_DAYS} days out`,
    };
  }
  if (b.note != null && (typeof b.note !== "string" || b.note.length > 200)) {
    return { ok: false, error: "note must be a string of at most 200 chars" };
  }

  return {
    ok: true,
    value: {
      siteId: b.siteId,
      metric: b.metric as GoalMetric,
      targetValue: b.targetValue,
      targetDate: b.targetDate,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
    },
  };
}

export interface AnnotationInput {
  siteId: string | null; // null = portfolio-wide
  eventDate: string;
  label: string;
  kind: AnnotationKind;
}

export function parseAnnotationInput(
  body: unknown,
): ParseResult<AnnotationInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (b.siteId != null && !isUuid(b.siteId)) {
    return { ok: false, error: "siteId must be a valid UUID or null" };
  }
  if (typeof b.eventDate !== "string" || !DATE_RE.test(b.eventDate)) {
    return { ok: false, error: "eventDate must be YYYY-MM-DD" };
  }
  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (label.length < 1 || label.length > 80) {
    return { ok: false, error: "label must be 1-80 characters" };
  }
  const kind = (b.kind ?? "other") as string;
  if (!ANNOTATION_KINDS.includes(kind as AnnotationKind)) {
    return {
      ok: false,
      error: "kind must be one of deploy, content, seo, other",
    };
  }

  return {
    ok: true,
    value: {
      siteId: (b.siteId as string | undefined) ?? null,
      eventDate: b.eventDate,
      label,
      kind: kind as AnnotationKind,
    },
  };
}

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
