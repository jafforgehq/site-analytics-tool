// scheduled-indexing: daily. Reads each active site's sitemap, then asks the
// Search Console URL Inspection API about a bounded batch of its URLs and
// stores the result in url_inspections. Auth: the automation secret.
//
// Scope & safety:
//   * Sitemap XML is remote input. Only the site's own origin /sitemap.xml and
//     same-host child sitemaps are fetched; redirects are followed manually and
//     only within the same host; every listed URL is host-filtered before use.
//   * Bounded work: 500 URLs/site, 5 child sitemaps, 40 inspections/site/run,
//     10s timeouts, 5MB response cap, concurrency 3, overall time budget.

import { requireAutomationSecret } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/database.ts";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { normalizeError, sanitizeMessage } from "../_shared/errors.ts";
import {
  MAX_CHILD_SITEMAPS,
  MAX_URLS_PER_SITE,
  filterSameHost,
  mapInspectionResult,
  parseSitemapXml,
  prioritizeInspections,
  removedUrls,
  sitemapTarget,
} from "../_shared/indexing.ts";
import { json } from "../_shared/response.ts";

const MAX_SITES_PER_RUN = 50;
const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const RUN_BUDGET_MS = 120_000;
const INSPECT_URL =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

interface SiteRow {
  id: string;
  website_url: string;
  gsc_property: string;
}

/** Read at most MAX_BODY_BYTES of text; returns null if the body is larger. */
async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** GET an XML document, never leaving `host`. Returns null on any failure. */
async function fetchSameHostText(
  rawUrl: string,
  host: string,
): Promise<string | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.host.toLowerCase() !== host) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(u, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "site-analytics-indexing/1.0" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc) return null;
        current = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }
      return await readCapped(res);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function collectUrls(site: SiteRow): Promise<string[] | null> {
  const target = sitemapTarget(site.website_url);
  if (!target) return null;
  const xml = await fetchSameHostText(target.sitemapUrl, target.host);
  if (xml === null) return null;

  const root = parseSitemapXml(xml);
  if (root.kind === "urlset") {
    return filterSameHost(root.locs, target.host, MAX_URLS_PER_SITE);
  }

  const children = filterSameHost(root.locs, target.host, MAX_CHILD_SITEMAPS);
  const urls: string[] = [];
  for (const child of children) {
    if (urls.length >= MAX_URLS_PER_SITE) break;
    const childXml = await fetchSameHostText(child, target.host);
    if (childXml === null) continue;
    const parsed = parseSitemapXml(childXml);
    if (parsed.kind !== "urlset") continue; // no nested indexes
    for (const u of filterSameHost(
      parsed.locs,
      target.host,
      MAX_URLS_PER_SITE,
    )) {
      if (urls.length >= MAX_URLS_PER_SITE) break;
      if (!urls.includes(u)) urls.push(u);
    }
  }
  return urls;
}

interface SiteOutcome {
  siteId: string;
  sitemapUrls: number;
  inspected: number;
  failed: number;
  rateLimited: boolean;
  error?: string;
}

async function processSite(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  site: SiteRow,
  deadline: number,
): Promise<SiteOutcome> {
  const outcome: SiteOutcome = {
    siteId: site.id,
    sitemapUrls: 0,
    inspected: 0,
    failed: 0,
    rateLimited: false,
  };

  const urls = await collectUrls(site);
  if (!urls || urls.length === 0) {
    outcome.error = "sitemap_unavailable";
    return outcome;
  }
  outcome.sitemapUrls = urls.length;

  const { data: existing, error: existingError } = await admin
    .from("url_inspections")
    .select("url,inspected_at")
    .eq("site_id", site.id)
    .limit(5000);
  if (existingError) {
    outcome.error = normalizeError(existingError).code;
    return outcome;
  }
  const inspectedAt = new Map(
    (existing ?? []).map((r: { url: string; inspected_at: string }) => [
      r.url,
      r.inspected_at,
    ]),
  );

  const gone = removedUrls(inspectedAt.keys(), urls);
  for (let i = 0; i < gone.length; i += 200) {
    await admin
      .from("url_inspections")
      .delete()
      .eq("site_id", site.id)
      .in("url", gone.slice(i, i + 200));
  }

  const queue = prioritizeInspections(urls, inspectedAt);
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        if (outcome.rateLimited || Date.now() > deadline) return;
        const url = queue.shift();
        if (!url) return;
        const inspectedNow = new Date().toISOString();
        try {
          const res = await fetch(INSPECT_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inspectionUrl: url,
              siteUrl: site.gsc_property,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 3),
          });
          if (res.status === 429) {
            await res.body?.cancel();
            outcome.rateLimited = true;
            return;
          }
          if (!res.ok) {
            await res.body?.cancel();
            throw new Error(`URL Inspection API returned HTTP ${res.status}`);
          }
          const fields = mapInspectionResult(await res.json());
          const { error } = await admin.from("url_inspections").upsert(
            {
              site_id: site.id,
              url,
              ...fields,
              inspected_at: inspectedNow,
              error: null,
            },
            { onConflict: "site_id,url" },
          );
          if (error) throw error;
          outcome.inspected++;
        } catch (err) {
          outcome.failed++;
          // Partial upsert: keeps the last good status columns, records why.
          await admin.from("url_inspections").upsert(
            {
              site_id: site.id,
              url,
              inspected_at: inspectedNow,
              error: sanitizeMessage(
                (err as { message?: string })?.message ?? err,
                200,
              ),
            },
            { onConflict: "site_id,url" },
          );
        }
      }
    },
  );
  await Promise.all(workers);
  return outcome;
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
    .select("id,website_url,gsc_property")
    .eq("is_active", true)
    .not("gsc_property", "is", null)
    .order("name")
    .limit(MAX_SITES_PER_RUN);
  if (error) {
    return json(500, { ok: false, error: normalizeError(error).code });
  }

  let token: string;
  try {
    token = await getGoogleAccessToken();
  } catch (err) {
    return json(500, { ok: false, error: normalizeError(err).code });
  }

  const deadline = Date.now() + RUN_BUDGET_MS;
  const results: SiteOutcome[] = [];
  for (const site of (sites ?? []) as SiteRow[]) {
    if (Date.now() > deadline) break;
    try {
      results.push(await processSite(admin, token, site, deadline));
    } catch (err) {
      results.push({
        siteId: site.id,
        sitemapUrls: 0,
        inspected: 0,
        failed: 0,
        rateLimited: false,
        error: normalizeError(err).code,
      });
    }
  }

  return json(200, { ok: true, processed: results.length, results });
});
