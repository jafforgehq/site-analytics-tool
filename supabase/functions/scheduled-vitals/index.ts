// scheduled-vitals: weekly PageSpeed Insights (Lighthouse + CrUX field data) for
// each active site's homepage, mobile and desktop, upserted into web_vitals.
// Auth: the automation secret.
//
// Only the admin-managed website_url is passed to PSI (never caller input).
// Calls are sequential with a 60s timeout each; one failure never aborts the
// run. PSI_API_KEY is optional (anonymous quota is small but fine weekly).

import { requireAutomationSecret } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/database.ts";
import { normalizeError } from "../_shared/errors.ts";
import { json } from "../_shared/response.ts";
import { extractVitals } from "../_shared/vitals.ts";

const MAX_SITES_PER_RUN = 50;
const PSI_TIMEOUT_MS = 60_000;
const STRATEGIES = ["mobile", "desktop"] as const;

interface SiteRow {
  id: string;
  website_url: string;
}

function psiUrl(target: string, strategy: string): string {
  const params = new URLSearchParams({
    url: target,
    strategy,
    category: "performance",
  });
  const key = Deno.env.get("PSI_API_KEY");
  if (key) params.set("key", key);
  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
}

Deno.serve(async (req) => {
  try {
    requireAutomationSecret(req);
  } catch (err) {
    const n = normalizeError(err);
    return json(n.status ?? 401, { ok: false, error: n.code });
  }

  const admin = createAdminClient();
  const { data: sites, error } = await admin
    .from("sites")
    .select("id,website_url")
    .eq("is_active", true)
    .order("name")
    .limit(MAX_SITES_PER_RUN);
  if (error) {
    return json(500, { ok: false, error: normalizeError(error).code });
  }

  const measuredOn = new Date().toISOString().slice(0, 10);
  let written = 0;
  const failures: Array<{ siteId: string; strategy: string; error: string }> =
    [];

  for (const site of (sites ?? []) as SiteRow[]) {
    for (const strategy of STRATEGIES) {
      try {
        const res = await fetch(psiUrl(site.website_url, strategy), {
          signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
        });
        if (!res.ok) {
          await res.body?.cancel();
          throw new Error(`PSI returned HTTP ${res.status}`);
        }
        const vitals = extractVitals(await res.json());
        const { error: upsertError } = await admin.from("web_vitals").upsert(
          {
            site_id: site.id,
            strategy,
            measured_on: measuredOn,
            ...vitals,
          },
          { onConflict: "site_id,strategy,measured_on" },
        );
        if (upsertError) throw upsertError;
        written++;
      } catch (err) {
        failures.push({
          siteId: site.id,
          strategy,
          error: normalizeError(err).code,
        });
      }
    }
  }

  return json(200, { ok: true, written, failed: failures.length, failures });
});
