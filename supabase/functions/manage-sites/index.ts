import { preflight, corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { requireAdminMfa } from "../_shared/auth.ts";
import { normalizeError } from "../_shared/errors.ts";
import { parseSiteInput } from "../_shared/site-input.ts";
import { isUuid } from "../_shared/validate.ts";

const SITE_COLUMNS =
  "id,name,domain,website_url,gsc_property,ga4_property_id,bing_site_url,is_active,created_at,updated_at";

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

    // Delete cascades to metrics, sync history, and integration_status.
    if (action === "delete") {
      const id = body?.id;
      if (!isUuid(id)) {
        return json(
          400,
          {
            ok: false,
            error: "validation_error",
            message: "Valid site id required",
          },
          cors,
        );
      }
      const { error } = await admin.from("sites").delete().eq("id", id);
      if (error) throw error;
      return json(200, { ok: true }, cors);
    }

    if (action !== "create" && action !== "update") {
      return json(
        400,
        { ok: false, error: "validation_error", message: "Unknown action" },
        cors,
      );
    }

    const parsed = parseSiteInput(body?.site);
    if (!parsed.ok) {
      return json(
        400,
        { ok: false, error: "validation_error", message: parsed.error },
        cors,
      );
    }
    const input = parsed.value;

    if (action === "create") {
      const { data, error } = await admin
        .from("sites")
        .insert(input)
        .select(SITE_COLUMNS)
        .single();
      if (error) {
        if (error.code === "23505") {
          return json(
            409,
            {
              ok: false,
              error: "domain_exists",
              message: "That domain is already tracked.",
            },
            cors,
          );
        }
        throw error;
      }
      return json(200, { ok: true, site: data }, cors);
    }

    // update
    const id = body?.id;
    if (!isUuid(id)) {
      return json(
        400,
        {
          ok: false,
          error: "validation_error",
          message: "Valid site id required",
        },
        cors,
      );
    }

    const { data, error } = await admin
      .from("sites")
      .update(input)
      .eq("id", id)
      .select(SITE_COLUMNS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return json(
          409,
          {
            ok: false,
            error: "domain_exists",
            message: "That domain is already tracked.",
          },
          cors,
        );
      }
      throw error;
    }
    if (!data) return json(404, { ok: false, error: "not_found" }, cors);

    // Keep each integration enabled iff its provider id is configured.
    const reconcile: Array<[string, boolean]> = [
      ["gsc", input.gsc_property != null],
      ["ga4", input.ga4_property_id != null],
      ["bing", input.bing_site_url != null],
    ];
    for (const [source, enabled] of reconcile) {
      await admin
        .from("integration_status")
        .update({ enabled })
        .eq("site_id", id)
        .eq("source", source);
    }

    return json(200, { ok: true, site: data }, cors);
  } catch (err) {
    const n = normalizeError(err);
    return json(
      n.status ?? 500,
      { ok: false, error: n.code, message: n.message },
      cors,
    );
  }
});
