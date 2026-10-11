import { useMemo } from "react";
import { SearchCheck } from "lucide-react";
import { useUrlInspections } from "@/lib/hooks";
import { shortPath } from "@/lib/url";
import { relativeTime } from "@/lib/dates";
import { usePrivacyMode } from "@/lib/privacy";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { UrlInspection } from "@/types/database";

const LIST_LIMIT = 15;

type IndexState = "indexed" | "not_indexed" | "unchecked";

function indexState(row: UrlInspection): IndexState {
  if (row.error || !row.verdict) return "unchecked";
  return row.verdict === "PASS" ? "indexed" : "not_indexed";
}

/**
 * Indexing status from the Search Console URL Inspection API, for URLs listed
 * in the site's sitemap. Pages that aren't indexed can never earn traffic, and
 * they don't show up in search data - this is the only place they're visible.
 */
export function IndexingSection({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  const query = useUrlInspections(siteId);

  const { counts, notIndexed, lastInspected } = useMemo(() => {
    const rows = query.data ?? [];
    const counts = { indexed: 0, not_indexed: 0, unchecked: 0 };
    const notIndexed: UrlInspection[] = [];
    let lastInspected: string | null = null;
    for (const row of rows) {
      const state = indexState(row);
      counts[state] += 1;
      if (state === "not_indexed") notIndexed.push(row);
      if (!lastInspected || row.inspected_at > lastInspected) {
        lastInspected = row.inspected_at;
      }
    }
    return { counts, notIndexed, lastInspected };
  }, [query.data]);

  if (query.isLoading) return <Skeleton className="h-32" />;
  if (query.isError) return null;

  const total = (query.data ?? []).length;
  if (total === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Indexing status</h2>
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <SearchCheck className="h-4 w-4" aria-hidden />
            Sitemap URLs are inspected daily once the indexing check has run.
            Results appear here.
          </CardContent>
        </Card>
      </section>
    );
  }

  const show = (n: number, key: string) =>
    privacy.maskNumber(n, `indexing:${siteId}:${key}`) ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Indexing status</h2>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Indexed" value={show(counts.indexed, "indexed")} />
        <StatCard
          label="Not indexed"
          value={show(counts.not_indexed, "not-indexed")}
          hint={
            counts.not_indexed > 0 ? (
              <span className="text-warning">can't earn search traffic</span>
            ) : undefined
          }
        />
        <StatCard
          label="Not checked yet"
          value={show(counts.unchecked, "unchecked")}
          hint={
            <span>
              last run{" "}
              {privacy.enabled ? "********" : relativeTime(lastInspected)}
            </span>
          }
        />
      </div>
      {notIndexed.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Page</th>
                  <th className="px-3 py-2 font-medium">Why not indexed</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Last crawl
                  </th>
                </tr>
              </thead>
              <tbody>
                {notIndexed.slice(0, LIST_LIMIT).map((row) => (
                  <tr
                    key={row.url}
                    className="border-b border-border last:border-0"
                  >
                    <td className="max-w-[18rem] truncate px-3 py-2">
                      {privacy.maskText(
                        shortPath(row.url),
                        `indexing:${row.url}`,
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.coverage_state ?? row.verdict ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {privacy.enabled
                        ? "********"
                        : row.last_crawl_time
                          ? relativeTime(row.last_crawl_time)
                          : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notIndexed.length > LIST_LIMIT && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              + {notIndexed.length - LIST_LIMIT} more
            </p>
          )}
        </Card>
      )}
    </section>
  );
}
