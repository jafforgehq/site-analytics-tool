// manage-portfolio: the single write path for tracked queries. Same trust
// model as manage-sites - a valid session, aal2 (MFA), and admin allowlist
// membership are all verified before any write. The table has a server-side
// row cap so no authenticated session can bloat the database.

import { preflight, corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { requireAdminMfa } from "../_shared/auth.ts";
import { normalizeError } from "../_shared/errors.ts";
import {
  MAX_TRACKED_QUERIES_PER_SITE,
  parseTrackedQueryInput,
} from "../_shared/portfolio-input.ts";

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
