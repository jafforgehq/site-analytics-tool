import { describe, expect, it } from "vitest";
import { parseSiteInput } from "../../supabase/functions/_shared/site-input";

const base = {
  name: "Example Blog",
  domain: "example-blog.test",
  website_url: "https://example-blog.test",
};

describe("parseSiteInput", () => {
  it("accepts a valid site and trims optionals to null", () => {
    const r = parseSiteInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.gsc_property).toBeNull();
      expect(r.value.is_active).toBe(true);
    }
  });

  it("lowercases the domain and keeps provider ids", () => {
    const r = parseSiteInput({
      ...base,
      domain: "Example.COM",
      ga4_property_id: " 483920114 ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.domain).toBe("example.com");
      expect(r.value.ga4_property_id).toBe("483920114");
    }
  });

  it("rejects an empty name", () => {
    expect(parseSiteInput({ ...base, name: "  " }).ok).toBe(false);
  });

  it("rejects an invalid domain", () => {
    expect(parseSiteInput({ ...base, domain: "not a domain" }).ok).toBe(false);
  });

  it("rejects a non-http website url", () => {
    expect(parseSiteInput({ ...base, website_url: "ftp://x.com" }).ok).toBe(
      false,
    );
  });

  it("rejects a non-object body", () => {
    expect(parseSiteInput(null).ok).toBe(false);
  });
});
