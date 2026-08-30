// manage-portfolio: the single write path for goals, annotations, and tracked
// queries. Same trust model as manage-sites - a valid session, aal2 (MFA), and
// admin allowlist membership are all verified before any write. Every table
// has a server-side row cap so no authenticated session can bloat the
// database.

import { preflight, corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { requireAdminMfa } from "../_shared/auth.ts";
import { normalizeError } from "../_shared/errors.ts";
import { isUuid } from "../_shared/validate.ts";
import {
  MAX_ANNOTATIONS,
  MAX_GOALS_PER_SITE,
  MAX_TRACKED_QUERIES_PER_SITE,
  parseAnnotationInput,
  parseGoalInput,
  parseTrackedQueryInput,
} from "../_shared/portfolio-input.ts";

const GOAL_COLUMNS =
  "id,site_id,metric,target_value,target_date,note,created_at,updated_at";
const ANNOTATION_COLUMNS = "id,site_id,event_date,label,kind,created_at";

function validationError(message: string, cors: Record<string, string>) {
  return json(400, { ok: false, error: "validation_error", message }, cors);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const cors = corsHeaders(req);

  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" }, cors);
    }

    const { admin } = await requireAdminMfa(req);

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const action = body?.action;
    const today = new Date().toISOString().slice(0, 10);

    // Goals -----------------------------------------------------------------
    if (action === "goal.create") {
      const parsed = parseGoalInput(body?.goal, today);
      if (!parsed.ok) return validationError(parsed.error, cors);
      const input = parsed.value;

      const { count, error: countError } = await admin
        .from("site_goals")
        .select("id", { count: "exact", head: true })
        .eq("site_id", input.siteId);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_GOALS_PER_SITE) {
        return json(
          409,
          {
            ok: false,
            error: "limit_reached",
            message: `A site may have at most ${MAX_GOALS_PER_SITE} goals.`,
          },
          cors,
        );
      }

      const { data, error } = await admin
        .from("site_goals")
        .insert({
          site_id: input.siteId,
          metric: input.metric,
          target_value: input.targetValue,
          target_date: input.targetDate,
          note: input.note,
        })
        .select(GOAL_COLUMNS)
        .single();
      if (error) throw error;
      return json(200, { ok: true, goal: data }, cors);
    }

    if (action === "goal.delete") {
      if (!isUuid(body?.id)) return validationError("Valid id required", cors);
      const { error } = await admin
        .from("site_goals")
        .delete()
        .eq("id", body!.id as string);
      if (error) throw error;
      return json(200, { ok: true }, cors);
    }

    // Annotations -----------------------------------------------------------
    if (action === "annotation.create") {
      const parsed = parseAnnotationInput(body?.annotation);
      if (!parsed.ok) return validationError(parsed.error, cors);
      const input = parsed.value;

      const { count, error: countError } = await admin
        .from("annotations")
        .select("id", { count: "exact", head: true });
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_ANNOTATIONS) {
        return json(
          409,
          {
            ok: false,
            error: "limit_reached",
            message: `At most ${MAX_ANNOTATIONS} annotations are kept - delete old ones first.`,
          },
          cors,
        );
      }

      const { data, error } = await admin
        .from("annotations")
        .insert({
          site_id: input.siteId,
          event_date: input.eventDate,
          label: input.label,
          kind: input.kind,
        })
        .select(ANNOTATION_COLUMNS)
        .single();
      if (error) throw error;
      return json(200, { ok: true, annotation: data }, cors);
    }

    if (action === "annotation.delete") {
      if (!isUuid(body?.id)) return validationError("Valid id required", cors);
      const { error } = await admin
        .from("annotations")
        .delete()
        .eq("id", body!.id as string);
      if (error) throw error;
      return json(200, { ok: true }, cors);
    }

    // Tracked queries --------------------------------------------------------
    if (action === "tracked-query.add") {
      const parsed = parseTrackedQueryInput(body?.trackedQuery);
      if (!parsed.ok) return validationError(parsed.error, cors);
      const input = parsed.value;

      const { count, error: countError } = await admin
        .from("tracked_queries")
        .select("query", { count: "exact", head: true })
        .eq("site_id", input.siteId);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_TRACKED_QUERIES_PER_SITE) {
        return json(
          409,
          {
            ok: false,
            error: "limit_reached",
            message: `A site may track at most ${MAX_TRACKED_QUERIES_PER_SITE} queries.`,
          },
          cors,
        );
      }

      const { error } = await admin
        .from("tracked_queries")
        .upsert(
          { site_id: input.siteId, query: input.query },
          { onConflict: "site_id,query", ignoreDuplicates: true },
        );
      if (error) throw error;
      return json(200, { ok: true }, cors);
    }

    if (action === "tracked-query.remove") {
      const parsed = parseTrackedQueryInput(body?.trackedQuery);
      if (!parsed.ok) return validationError(parsed.error, cors);
      const { error } = await admin
        .from("tracked_queries")
        .delete()
        .eq("site_id", parsed.value.siteId)
        .eq("query", parsed.value.query);
      if (error) throw error;
      return json(200, { ok: true }, cors);
    }

    return validationError("Unknown action", cors);
  } catch (err) {
    const normalized = normalizeError(err);
    const status =
      normalized.status && normalized.status >= 400 && normalized.status < 600
        ? normalized.status
        : 500;
    return json(
      status,
      { ok: false, error: normalized.code, message: normalized.message },
      cors,
    );
  }
});
