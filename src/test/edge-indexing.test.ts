import { describe, expect, it } from "vitest";
import {
  filterSameHost,
  mapInspectionResult,
  parseSitemapXml,
  prioritizeInspections,
  removedUrls,
  sitemapTarget,
} from "../../supabase/functions/_shared/indexing";

describe("parseSitemapXml", () => {
  it("parses a urlset with entities and CDATA", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://a.com/x?a=1&amp;b=2</loc></url>
      <url><loc><![CDATA[https://a.com/y]]></loc></url>
    </urlset>`;
    expect(parseSitemapXml(xml)).toEqual({
      kind: "urlset",
      locs: ["https://a.com/x?a=1&b=2", "https://a.com/y"],
    });
  });

  it("detects a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(xml)).toEqual({
      kind: "index",
      locs: ["https://a.com/s1.xml"],
    });
  });

  it("returns no locs for garbage", () => {
    expect(parseSitemapXml("<html>nope</html>").locs).toEqual([]);
  });
});

describe("sitemapTarget", () => {
  it("builds the origin sitemap and host", () => {
    expect(sitemapTarget("https://Example.com/blog/?x=1")).toEqual({
      host: "example.com",
      sitemapUrl: "https://example.com/sitemap.xml",
    });
  });
  it("rejects non-http, credentials and junk", () => {
    expect(sitemapTarget("ftp://a.com")).toBeNull();
    expect(sitemapTarget("https://u:p@a.com")).toBeNull();
    expect(sitemapTarget("not a url")).toBeNull();
  });
});

describe("filterSameHost", () => {
  it("drops other hosts, schemes, junk, fragments and duplicates", () => {
    const out = filterSameHost(
      [
        "https://a.com/1",
        "https://a.com/1#frag",
        "https://evil.com/2",
        "https://sub.a.com/3",
        "http://169.254.169.254/latest",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "nonsense",
        "https://A.com/4",
      ],
      "a.com",
    );
    expect(out).toEqual(["https://a.com/1", "https://a.com/4"]);
  });

  it("respects the cap", () => {
    const locs = Array.from({ length: 10 }, (_, i) => `https://a.com/${i}`);
    expect(filterSameHost(locs, "a.com", 3)).toHaveLength(3);
  });
});

describe("prioritizeInspections", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  const urls = ["u1", "u2", "u3", "u4", "u5"];
  const seen = new Map([
    ["u1", "2026-10-10T00:00:00Z"], // 1 day: skip
    ["u2", "2026-09-01T00:00:00Z"], // oldest
    ["u3", "2026-10-01T00:00:00Z"],
  ]);

  it("never-inspected first, then oldest; skips recent", () => {
    expect(prioritizeInspections(urls, seen, now)).toEqual([
      "u4",
      "u5",
      "u2",
      "u3",
    ]);
  });

  it("caps the batch", () => {
    expect(prioritizeInspections(urls, seen, now, 3)).toEqual([
      "u4",
      "u5",
      "u2",
    ]);
  });

  it("treats unparseable dates as never inspected", () => {
    expect(prioritizeInspections(["x"], new Map([["x", "bad"]]), now)).toEqual([
      "x",
    ]);
  });
});

describe("removedUrls", () => {
  it("returns rows no longer in the sitemap", () => {
    expect(removedUrls(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });
});

describe("mapInspectionResult", () => {
  it("maps indexStatusResult", () => {
    expect(
      mapInspectionResult({
        inspectionResult: {
          indexStatusResult: {
            verdict: "PASS",
            coverageState: "Submitted and indexed",
            indexingState: "INDEXING_ALLOWED",
            robotsTxtState: "ALLOWED",
            lastCrawlTime: "2026-10-01T10:00:00Z",
            googleCanonical: "https://a.com/",
          },
        },
      }),
    ).toEqual({
      verdict: "PASS",
      coverage_state: "Submitted and indexed",
      indexing_state: "INDEXING_ALLOWED",
      robots_txt_state: "ALLOWED",
      last_crawl_time: "2026-10-01T10:00:00Z",
      google_canonical: "https://a.com/",
    });
  });

  it("nulls everything on an empty or bad response", () => {
    const empty = mapInspectionResult({});
    expect(Object.values(empty).every((v) => v === null)).toBe(true);
    expect(mapInspectionResult(null).verdict).toBeNull();
    expect(
      mapInspectionResult({
        inspectionResult: { indexStatusResult: { lastCrawlTime: "junk" } },
      }).last_crawl_time,
    ).toBeNull();
  });
});
