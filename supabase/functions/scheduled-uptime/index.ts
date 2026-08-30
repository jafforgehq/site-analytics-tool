// scheduled-uptime: hourly availability probe of every active site's public
// URL, recorded into uptime_checks. Auth: the automation secret, same as the
// scheduled syncs.
//
// Scope & safety:
//   * Only URLs already stored in the admin-managed sites table are fetched -
//     never caller-supplied input - and only http(s) URLs are accepted.
//   * Bounded work per run: site cap, per-request timeout, small concurrency.
//   * Self-pruning: rows older than the retention window are deleted here, so
//     the table cannot grow without bound.

import { requireAutomationSecret } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/database.ts";
import { normalizeError, sanitizeMessage } from "../_shared/errors.ts";
import { json } from "../_shared/response.ts";

const MAX_SITES_PER_RUN = 100;
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const RETENTION_DAYS = 90;

interface SiteRow {
  id: string;
  website_url: string;
}

interface CheckResult {
  site_id: string;
  checked_at: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
}

function probeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function checkSite(site: SiteRow): Promise<CheckResult> {
  const checkedAt = new Date().toISOString();
  const url = probeUrl(site.website_url);
  if (!url) {
    return {
      site_id: site.id,
      checked_at: checkedAt,
      ok: false,
      status_code: null,
      latency_ms: null,
      error: "invalid_url",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "site-analytics-uptime/1.0" },
    });
    const latency = Math.round(performance.now() - startedAt);
    // Drain (bounded) so the connection can be reused/closed cleanly.
    await res.body?.cancel();
    return {
      site_id: site.id,
      checked_at: checkedAt,
      ok: res.status < 400,
      status_code: res.status,
      latency_ms: latency,
      error: res.status < 400 ? null : `http_${res.status}`,
    };
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    return {
      site_id: site.id,
      checked_at: checkedAt,
      ok: false,
      status_code: null,
      latency_ms: aborted ? REQUEST_TIMEOUT_MS : null,
      error: aborted ? "timeout" : sanitizeMessage(err, 120),
    };
  } finally {
    clearTimeout(timer);
  }
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

  const queue = [...((sites ?? []) as SiteRow[])];
  const results: CheckResult[] = [];
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const site = queue.shift();
        if (!site) return;
        results.push(await checkSite(site));
      }
    },
  );
  await Promise.all(workers);

  if (results.length > 0) {
    const { error: insertError } = await admin
      .from("uptime_checks")
      .insert(results);
    if (insertError) {
      return json(500, { ok: false, error: normalizeError(insertError).code });
    }
  }

  // Self-pruning retention.
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 86_400_000,
  ).toISOString();
  await admin.from("uptime_checks").delete().lt("checked_at", cutoff);

  return json(200, {
    ok: true,
    checked: results.length,
    up: results.filter((r) => r.ok).length,
  });
});
