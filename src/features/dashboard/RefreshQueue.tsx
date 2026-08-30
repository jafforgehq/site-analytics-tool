import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FileWarning } from "lucide-react";
import { format } from "date-fns";
import { usePortfolioPageDaily } from "@/lib/hooks";
import { computePortfolioDecay } from "@/lib/series";
import {
  formatNumber,
  formatPercentChange,
  formatPosition,
} from "@/lib/format";
import { usePrivacyMode } from "@/lib/privacy";
import type { Site } from "@/types/database";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const WINDOW_DAYS = 28;

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

/**
 * Content refresh queue: pages across the portfolio whose Google clicks
 * dropped ≥25% versus their own prior 28 days - the highest-ROI list for a
 * publisher deciding what to update next.
 */
export function RefreshQueue({
  sites,
}: {
  sites: Pick<Site, "id" | "name">[];
}) {
  const privacy = usePrivacyMode();
  const pagesQuery = usePortfolioPageDaily(WINDOW_DAYS);

  const decays = useMemo(
    () =>
      computePortfolioDecay(
        pagesQuery.data ?? [],
        sites,
        format(new Date(), "yyyy-MM-dd"),
      ),
    [pagesQuery.data, sites],
  );

  if (pagesQuery.isLoading) return <Skeleton className="h-40" />;
  if (pagesQuery.isError) return null; // non-critical panel

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Content refresh queue</h2>
      {decays.length === 0 ? (
        <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <FileWarning className="h-4 w-4" aria-hidden />
          No decaying pages right now - nothing lost ≥25% of its clicks versus
          the prior {WINDOW_DAYS} days.
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Page</th>
                  <th className="px-2 py-2 font-medium">Site</th>
                  <th className="px-2 py-2 text-right font-medium">Clicks</th>
                  <th className="px-2 py-2 text-right font-medium">Change</th>
                  <th className="px-2 py-2 text-right font-medium">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {decays.map((row) => (
                  <tr
                    key={`${row.siteId}:${row.page}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="max-w-[16rem] px-3 py-2">
                      <span
                        className="block truncate"
                        title={privacy.enabled ? undefined : row.page}
                      >
                        {privacy.enabled
                          ? privacy.maskText(row.page, `decay:${row.page}`)
                          : shortPath(row.page)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        to={`/sites/${row.siteId}`}
                        className="text-primary hover:underline"
                      >
                        {privacy.maskText(
                          row.siteName,
                          `decay:${row.siteId}:name`,
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatNumber(
                        privacy.maskNumber(
                          row.currentClicks,
                          `decay:${row.page}:cur`,
                        ),
                      )}
                      <span className="text-muted-foreground">
                        {" "}
                        /{" "}
                        {formatNumber(
                          privacy.maskNumber(
                            row.previousClicks,
                            `decay:${row.page}:prev`,
                          ),
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-critical">
                      {formatPercentChange(
                        privacy.enabled
                          ? privacy.maskNumber(
                              row.changePct,
                              `decay:${row.page}:pct`,
                              { min: -95, max: -25, decimals: 1 },
                            )
                          : row.changePct,
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {row.currentPosition != null &&
                      row.previousPosition != null
                        ? `${formatPosition(
                            privacy.maskNumber(
                              row.previousPosition,
                              `decay:${row.page}:posprev`,
                              { min: 1, max: 95, decimals: 1 },
                            ),
                          )} → ${formatPosition(
                            privacy.maskNumber(
                              row.currentPosition,
                              `decay:${row.page}:poscur`,
                              { min: 1, max: 95, decimals: 1 },
                            ),
                          )}`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
