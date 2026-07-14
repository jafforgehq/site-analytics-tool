import { requireAutomationSecret } from "./auth.ts";
import { createAdminClient } from "./database.ts";
import { runIntegrationSync, type SiteRow } from "./sync-run.ts";
import { ADAPTERS } from "./registry.ts";
import { normalizeError } from "./errors.ts";
import { json } from "./response.ts";
import type { SyncSource } from "./validate.ts";

const SITE_COLUMNS =
  "id,name,domain,gsc_property,ga4_property_id,bing_site_url";

/**
 * Shared body of every scheduled-sync-* function: validate the automation
 * secret, then run the given source for every active site. A failure on one
 * site is isolated so the rest still run.
 */
export async function runScheduled(
  req: Request,
  source: SyncSource,
): Promise<Response> {
  try {
    requireAutomationSecret(req);
  } catch (err) {
    const n = normalizeError(err);
    return json(n.status ?? 401, { ok: false, error: n.code });
  }

  const admin = createAdminClient();
  const { data: sites, error } = await admin
    .from("sites")
    .select(SITE_COLUMNS)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return json(500, { ok: false, error: normalizeError(error).code });
  }

  const results: Array<{ siteId: string; status: string; code?: string }> = [];
  for (const site of (sites ?? []) as SiteRow[]) {
    try {
      const outcome = await runIntegrationSync({
        admin,
        site,
        source,
        triggerType: "scheduled",
        adapter: ADAPTERS[source],
      });
      results.push({ siteId: site.id, status: outcome.status });
    } catch (err) {
      results.push({
        siteId: site.id,
        status: "error",
        code: normalizeError(err).code,
      });
    }
  }

  return json(200, {
    ok: true,
    source,
    processed: results.length,
    results,
  });
}
