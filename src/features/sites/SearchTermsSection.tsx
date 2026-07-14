import { useSiteSearchTerms } from "@/lib/hooks";
import type { TermRow } from "@/lib/search-terms";
import { Card } from "@/components/ui/card";
import { MetricDelta } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCtr, formatNumber, formatPosition } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";

const TOP_N = 20;

export function SearchTermsSection({
  siteId,
  days,
}: {
  siteId: string;
  days: number;
}) {
  const { data, isLoading, isError } = useSiteSearchTerms(siteId, days);

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError || !data) return null; // non-critical; the rest of the page still works

  const hasData = data.queries.length > 0 || data.pages.length > 0;
  if (!hasData) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Search terms &amp; pages</h2>
        <EmptyState
          title="No query or page data yet"
          description="Top queries and pages from Search Console appear here after the next GSC sync."
        />
      </section>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <TermsTable
        title="Top search terms"
        keyHeader="Query"
        rows={data.queries.slice(0, TOP_N)}
        tableKey={`${siteId}:${days}:queries`}
      />
      <TermsTable
        title="Top pages"
        keyHeader="Page"
        rows={data.pages.slice(0, TOP_N)}
        tableKey={`${siteId}:${days}:pages`}
        isPage
      />
    </div>
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

function flag(row: TermRow): { label: string; tone: string } | null {
  if (row.clicksPct != null && row.clicksPct >= 50 && row.clicks >= 5) {
    return {
      label: "Rising",
      tone: "border-success/30 bg-success/10 text-success",
    };
  }
  if (row.position != null && row.position > 10 && row.position <= 20) {
    return {
      label: "Page 2",
      tone: "border-warning/30 bg-warning/10 text-warning",
    };
  }
  if (row.impressions >= 100 && row.ctr != null && row.ctr < 0.02) {
    return {
      label: "Low CTR",
      tone: "border-primary/30 bg-primary/10 text-primary",
    };
  }
  return null;
}

function TermsTable({
  title,
  keyHeader,
  rows,
  tableKey,
  isPage = false,
}: {
  title: string;
  keyHeader: string;
  rows: TermRow[];
  tableKey: string;
  isPage?: boolean;
}) {
  const privacy = usePrivacyMode();
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{keyHeader}</th>
                <th className="px-2 py-2 text-right font-medium">Clicks</th>
                <th className="px-2 py-2 text-right font-medium">Impr.</th>
                <th className="px-2 py-2 text-right font-medium">CTR</th>
                <th className="px-2 py-2 text-right font-medium">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const f = flag(row);
                return (
                  <tr
                    key={row.key}
                    className="border-b border-border last:border-0"
                  >
                    <td className="max-w-[14rem] px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="truncate"
                          title={
                            privacy.enabled
                              ? "********"
                              : isPage
                                ? shortPath(row.key)
                                : row.key
                          }
                        >
                          {privacy.enabled
                            ? privacy.maskText(
                                row.key,
                                `${tableKey}:${row.key}`,
                              )
                            : isPage
                              ? shortPath(row.key)
                              : row.key}
                        </span>
                        {f && (
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1 text-[10px] font-medium",
                              f.tone,
                            )}
                          >
                            {f.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <div>
                        {formatNumber(
                          privacy.maskNumber(
                            row.clicks,
                            `${tableKey}:${row.key}:clicks`,
                          ),
                        )}
                      </div>
                      <div className="text-[10px]">
                        <MetricDelta change={row.clicksPct} compact />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatNumber(
                        privacy.maskNumber(
                          row.impressions,
                          `${tableKey}:${row.key}:impressions`,
                        ),
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatCtr(
                        privacy.maskNumber(
                          row.ctr,
                          `${tableKey}:${row.key}:ctr`,
                          {
                            min: 0,
                            max: 0.5,
                            decimals: 4,
                          },
                        ),
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatPosition(
                        privacy.maskNumber(
                          row.position,
                          `${tableKey}:${row.key}:position`,
                          { min: 1, max: 95, decimals: 1 },
                        ),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
