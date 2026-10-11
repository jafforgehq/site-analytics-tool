import { useMemo } from "react";
import { format } from "date-fns";
import { useSitePageDaily } from "@/lib/hooks";
import { findNewPages } from "@/lib/opportunities";
import { formatNumber } from "@/lib/format";
import { shortDate } from "@/lib/dates";
import { shortPath } from "@/lib/url";
import { usePrivacyMode } from "@/lib/privacy";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Page rows are retained for 210 days (2 x 105).
const HISTORY_HALF_WINDOW = 105;

/**
 * Pages that first appeared in Search Console data after tracking began, with
 * how long they took to earn a first click. Shows what a new page's ramp-up
 * really looks like on this site.
 */
export function NewPagesSection({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  const query = useSitePageDaily(siteId, HISTORY_HALF_WINDOW);
  const pages = useMemo(
    () => findNewPages(query.data ?? [], format(new Date(), "yyyy-MM-dd")),
    [query.data],
  );

  if (query.isLoading) return <Skeleton className="h-32" />;
  if (query.isError || pages.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">New pages · time to first click</h2>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">First seen</th>
                <th className="px-3 py-2 text-right font-medium">
                  First click
                </th>
                <th className="px-3 py-2 text-right font-medium">Clicks</th>
                <th className="px-3 py-2 text-right font-medium">Last 7d</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr
                  key={p.page}
                  className="border-b border-border last:border-0"
                >
                  <td className="max-w-[18rem] truncate px-3 py-2">
                    {privacy.maskText(shortPath(p.page), `new-page:${p.page}`)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {privacy.enabled ? "********" : shortDate(p.firstSeen)}
                    {!privacy.enabled && ` · ${p.daysLive}d ago`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.daysToFirstClick == null
                      ? "none yet"
                      : p.daysToFirstClick === 0
                        ? "same day"
                        : `after ${p.daysToFirstClick}d`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(
                      privacy.maskNumber(p.clicks, `new-page:${p.page}:c`),
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(
                      privacy.maskNumber(
                        p.recentClicks,
                        `new-page:${p.page}:r`,
                      ),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
