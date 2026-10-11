// Pure sitemap parsing + URL-inspection prioritisation - no Deno/npm imports,
// unit-testable from Vitest. Sitemap XML comes from a remote host, so every
// URL is treated as untrusted and filtered here before anything fetches it.

export const MAX_URLS_PER_SITE = 500;
export const MAX_CHILD_SITEMAPS = 5;
export const MAX_INSPECTIONS_PER_SITE = 40;
export const REINSPECT_AFTER_DAYS = 7;

export interface ParsedSitemap {
  kind: "index" | "urlset";
  locs: string[];
}

function decodeXml(text: string): string {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Regex extraction of <loc> only; no XML parser needed for sitemaps. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : "urlset";
  const locs: string[] = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const loc = decodeXml(m[1]);
    if (loc) locs.push(loc);
  }
  return { kind, locs };
}

/** Host + sitemap URL for a site, or null for non-http(s) / credentialed URLs. */
export function sitemapTarget(
  websiteUrl: string,
): { host: string; sitemapUrl: string } | null {
  try {
    const u = new URL(websiteUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return {
      host: u.host.toLowerCase(),
      sitemapUrl: `${u.origin}/sitemap.xml`,
    };
  } catch {
    return null;
  }
}

/**
 * Keep only http(s) URLs whose host equals `host` (SSRF guard), strip
 * fragments, dedupe, and cap the count.
 */
export function filterSameHost(
  locs: string[],
  host: string,
  max = MAX_URLS_PER_SITE,
): string[] {
  const out = new Set<string>();
  for (const raw of locs) {
    if (out.size >= max) break;
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (u.username || u.password) continue;
      if (u.host.toLowerCase() !== host.toLowerCase()) continue;
      u.hash = "";
      out.add(u.toString());
    } catch {
      // not a URL
    }
  }
  return [...out];
}

/**
 * Pick URLs to inspect: never-inspected first (sitemap order), then oldest
 * inspected_at. Anything inspected within `minAgeDays` is skipped.
 */
export function prioritizeInspections(
  urls: string[],
  inspectedAt: Map<string, string>,
  now: Date = new Date(),
  max = MAX_INSPECTIONS_PER_SITE,
  minAgeDays = REINSPECT_AFTER_DAYS,
): string[] {
  const cutoff = now.getTime() - minAgeDays * 86_400_000;
  const fresh: string[] = [];
  const stale: { url: string; at: number }[] = [];
  for (const url of urls) {
    const at = inspectedAt.get(url);
    if (at === undefined) {
      fresh.push(url);
      continue;
    }
    const t = Date.parse(at);
    if (!Number.isFinite(t)) fresh.push(url);
    else if (t < cutoff) stale.push({ url, at: t });
  }
  stale.sort((a, b) => a.at - b.at);
  return [...fresh, ...stale.map((s) => s.url)].slice(0, max);
}

/** Existing rows whose URL left the sitemap. */
export function removedUrls(
  existing: Iterable<string>,
  current: string[],
): string[] {
  const keep = new Set(current);
  return [...existing].filter((u) => !keep.has(u));
}

export interface InspectionFields {
  verdict: string | null;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_txt_state: string | null;
  last_crawl_time: string | null;
  google_canonical: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** Map a URL Inspection API response to url_inspections columns. */
export function mapInspectionResult(body: unknown): InspectionFields {
  const r = (
    body as {
      inspectionResult?: { indexStatusResult?: Record<string, unknown> };
    }
  )?.inspectionResult?.indexStatusResult;
  const crawl = str(r?.lastCrawlTime);
  return {
    verdict: str(r?.verdict),
    coverage_state: str(r?.coverageState),
    indexing_state: str(r?.indexingState),
    robots_txt_state: str(r?.robotsTxtState),
    last_crawl_time: crawl && Number.isFinite(Date.parse(crawl)) ? crawl : null,
    google_canonical: str(r?.googleCanonical),
  };
}
