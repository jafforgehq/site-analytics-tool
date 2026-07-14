import { useState } from "react";
import { subDays, format } from "date-fns";
import { Download } from "lucide-react";
import {
  getSiteMetrics,
  getSiteSearchTerms,
  getSyncRuns,
  type DateCoverage,
  type SiteSearchTerms,
  type SiteWithStatuses,
  type SyncRunRow,
} from "@/lib/api";
import {
  type SiteReportRangePayload,
  type SiteReportDays,
} from "@/lib/site-report-pdf";
import { Button } from "@/components/ui/button";
import { usePrivacyMode } from "@/lib/privacy";

const SITE_REPORT_RANGES = [
  90, 180, 360,
] as const satisfies readonly SiteReportDays[];

const EMPTY_COVERAGE: DateCoverage = {
  firstDate: null,
  lastDate: null,
  daysWithRows: 0,
  rows: 0,
};

const EMPTY_TERMS: SiteSearchTerms = {
  queries: [],
  pages: [],
  coverage: {
    queries: EMPTY_COVERAGE,
    pages: EMPTY_COVERAGE,
  },
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown export error";
}

function maskSite(
  site: SiteWithStatuses,
  privacy: ReturnType<typeof usePrivacyMode>,
) {
  if (!privacy.enabled) return site;
  return {
    ...site,
    name: privacy.maskText(site.name, `pdf:${site.id}:name`),
    domain: privacy.maskText(site.domain, `pdf:${site.id}:domain`),
    website_url: privacy.maskText(site.website_url, `pdf:${site.id}:url`),
    gsc_property: privacy.maskText(site.gsc_property, `pdf:${site.id}:gsc`),
    ga4_property_id: privacy.maskText(
      site.ga4_property_id,
      `pdf:${site.id}:ga4`,
    ),
    bing_site_url: privacy.maskText(site.bing_site_url, `pdf:${site.id}:bing`),
    statuses: site.statuses.map((status) => ({
      ...status,
      last_rows_fetched:
        privacy.maskNumber(
          status.last_rows_fetched,
          `pdf:${site.id}:${status.source}:rows-fetched`,
        ) ?? 0,
      last_rows_written:
        privacy.maskNumber(
          status.last_rows_written,
          `pdf:${site.id}:${status.source}:rows-written`,
        ) ?? 0,
      last_error_message: privacy.maskText(
        status.last_error_message,
        `pdf:${site.id}:${status.source}:error`,
      ),
    })),
  };
}

function maskRange(
  range: SiteReportRangePayload,
  privacy: ReturnType<typeof usePrivacyMode>,
): SiteReportRangePayload {
  if (!privacy.enabled) return range;
  return {
    ...range,
    metrics: {
      analytics: range.metrics.analytics.map((row) => ({
        ...row,
        active_users:
          privacy.maskNumber(
            row.active_users,
            `pdf:${range.days}:${row.metric_date}:active-users`,
          ) ?? 0,
        total_users:
          privacy.maskNumber(
            row.total_users,
            `pdf:${range.days}:${row.metric_date}:total-users`,
          ) ?? 0,
        sessions:
          privacy.maskNumber(
            row.sessions,
            `pdf:${range.days}:${row.metric_date}:sessions`,
          ) ?? 0,
        screen_page_views:
          privacy.maskNumber(
            row.screen_page_views,
            `pdf:${range.days}:${row.metric_date}:pageviews`,
          ) ?? 0,
        engaged_sessions:
          privacy.maskNumber(
            row.engaged_sessions,
            `pdf:${range.days}:${row.metric_date}:engaged`,
          ) ?? 0,
      })),
      search: range.metrics.search.map((row) => ({
        ...row,
        clicks:
          privacy.maskNumber(
            row.clicks,
            `pdf:${range.days}:${row.engine}:${row.metric_date}:clicks`,
          ) ?? 0,
        impressions:
          privacy.maskNumber(
            row.impressions,
            `pdf:${range.days}:${row.engine}:${row.metric_date}:impressions`,
          ) ?? 0,
        ctr: privacy.maskNumber(
          row.ctr,
          `pdf:${range.days}:${row.engine}:${row.metric_date}:ctr`,
          { min: 0, max: 0.5, decimals: 4 },
        ),
        average_position: privacy.maskNumber(
          row.average_position,
          `pdf:${range.days}:${row.engine}:${row.metric_date}:position`,
          { min: 1, max: 95, decimals: 1 },
        ),
      })),
    },
    terms: {
      ...range.terms,
      queries: range.terms.queries.map((row) => ({
        ...row,
        key: privacy.maskText(row.key, `pdf:${range.days}:query:${row.key}`),
        clicks:
          privacy.maskNumber(
            row.clicks,
            `pdf:${range.days}:${row.key}:clicks`,
          ) ?? 0,
        clicksPrev:
          privacy.maskNumber(
            row.clicksPrev,
            `pdf:${range.days}:${row.key}:clicks-prev`,
          ) ?? 0,
        clicksPct: privacy.maskNumber(
          row.clicksPct,
          `pdf:${range.days}:${row.key}:clicks-pct`,
          { min: -80, max: 140, decimals: 1 },
        ),
        impressions:
          privacy.maskNumber(
            row.impressions,
            `pdf:${range.days}:${row.key}:impressions`,
          ) ?? 0,
        ctr: privacy.maskNumber(row.ctr, `pdf:${range.days}:${row.key}:ctr`, {
          min: 0,
          max: 0.5,
          decimals: 4,
        }),
        position: privacy.maskNumber(
          row.position,
          `pdf:${range.days}:${row.key}:position`,
          { min: 1, max: 95, decimals: 1 },
        ),
      })),
      pages: range.terms.pages.map((row) => ({
        ...row,
        key: privacy.maskText(row.key, `pdf:${range.days}:page:${row.key}`),
        clicks:
          privacy.maskNumber(
            row.clicks,
            `pdf:${range.days}:page:${row.key}:clicks`,
          ) ?? 0,
        clicksPrev:
          privacy.maskNumber(
            row.clicksPrev,
            `pdf:${range.days}:page:${row.key}:clicks-prev`,
          ) ?? 0,
        clicksPct: privacy.maskNumber(
          row.clicksPct,
          `pdf:${range.days}:page:${row.key}:clicks-pct`,
          { min: -80, max: 140, decimals: 1 },
        ),
        impressions:
          privacy.maskNumber(
            row.impressions,
            `pdf:${range.days}:page:${row.key}:impressions`,
          ) ?? 0,
        ctr: privacy.maskNumber(
          row.ctr,
          `pdf:${range.days}:page:${row.key}:ctr`,
          { min: 0, max: 0.5, decimals: 4 },
        ),
        position: privacy.maskNumber(
          row.position,
          `pdf:${range.days}:page:${row.key}:position`,
          { min: 1, max: 95, decimals: 1 },
        ),
      })),
    },
  };
}

function maskRuns(
  runs: SyncRunRow[],
  privacy: ReturnType<typeof usePrivacyMode>,
): SyncRunRow[] {
  if (!privacy.enabled) return runs;
  return runs.map((run) => ({
    ...run,
    site_name: privacy.maskText(run.site_name, `pdf-run:${run.site_id}:name`),
    site_domain: privacy.maskText(
      run.site_domain,
      `pdf-run:${run.site_id}:domain`,
    ),
    rows_fetched:
      privacy.maskNumber(run.rows_fetched, `pdf-run:${run.id}:rows-fetched`) ??
      0,
    rows_written:
      privacy.maskNumber(run.rows_written, `pdf-run:${run.id}:rows-written`) ??
      0,
    duration_ms: privacy.maskNumber(
      run.duration_ms,
      `pdf-run:${run.id}:duration`,
    ),
    error_message: privacy.maskText(
      run.error_message,
      `pdf-run:${run.id}:error`,
    ),
  }));
}

export function SiteReportExportButton({ site }: { site: SiteWithStatuses }) {
  const privacy = usePrivacyMode();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const generatedAt = new Date();
      const [reportModule, ranges, syncRuns] = await Promise.all([
        import("@/lib/site-report-pdf"),
        Promise.all(
          SITE_REPORT_RANGES.map(
            async (days): Promise<SiteReportRangePayload> => {
              const termsPromise: Promise<{
                terms: SiteSearchTerms;
                termsError?: string;
              }> = getSiteSearchTerms(site.id, days)
                .then((terms) => ({ terms }))
                .catch((termsError: unknown) => ({
                  terms: EMPTY_TERMS,
                  termsError: errorMessage(termsError),
                }));
              const [metrics, termsResult] = await Promise.all([
                getSiteMetrics(site.id, days),
                termsPromise,
              ]);
              return {
                days,
                metrics,
                terms: termsResult.terms,
                termsError: termsResult.termsError,
              };
            },
          ),
        ),
        getSyncRuns({
          siteId: site.id,
          since: format(subDays(generatedAt, 360), "yyyy-MM-dd"),
          limit: 25,
        }),
      ]);

      reportModule.saveSitePerformanceReport({
        site: maskSite(site, privacy),
        ranges: ranges.map((range) => maskRange(range, privacy)),
        syncRuns: maskRuns(syncRuns, privacy),
        generatedAt,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={exporting}
        onClick={() => void handleExport()}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export PDF
      </Button>
      {error && (
        <span className="max-w-[16rem] text-right text-xs text-critical">
          {error}
        </span>
      )}
    </div>
  );
}
