// Pure validation for the add/edit-site form - no Deno/npm imports, so it is
// unit-testable and shared by the edge function.
import type { ParseResult } from "./validate.ts";

export interface SiteInput {
  name: string;
  domain: string;
  website_url: string;
  gsc_property: string | null;
  ga4_property_id: string | null;
  bing_site_url: string | null;
  is_active: boolean;
}

const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  const s = str(value);
  return s.length > 0 ? s : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseSiteInput(body: unknown): ParseResult<SiteInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const name = str(b.name);
  if (name.length < 1 || name.length > 120) {
    return { ok: false, error: "Name is required (max 120 characters)" };
  }

  const domain = str(b.domain).toLowerCase();
  if (!DOMAIN_RE.test(domain)) {
    return { ok: false, error: "Enter a valid domain, e.g. example.com" };
  }

  const website_url = str(b.website_url);
  if (!isHttpUrl(website_url)) {
    return {
      ok: false,
      error: "Website URL must start with http:// or https://",
    };
  }

  return {
    ok: true,
    value: {
      name,
      domain,
      website_url,
      gsc_property: optional(b.gsc_property),
      ga4_property_id: optional(b.ga4_property_id),
      bing_site_url: optional(b.bing_site_url),
      is_active: b.is_active === undefined ? true : Boolean(b.is_active),
    },
  };
}
