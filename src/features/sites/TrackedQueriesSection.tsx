import { useMemo } from "react";
import { Star, X } from "lucide-react";
import { useTrackedQueryHistory, useTrackQuery } from "@/lib/hooks";
import { usePrivacyMode } from "@/lib/privacy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MetricLineChart,
  type ChartRow,
  type ChartSeries,
} from "@/components/charts/MetricLineChart";
import { CHART_COLORS } from "@/components/charts/chart-colors";
import { Skeleton } from "@/components/ui/skeleton";

const SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.violet,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.rose,
  CHART_COLORS.slate,
];

/**
 * Mini rank tracker: average position over time for the queries the admin has
 * starred in the top-terms table. Data comes from search_query_daily history -
 * no extra provider calls.
 */
export function TrackedQueriesSection({
  siteId,
  days,
}: {
  siteId: string;
  days: number;
}) {
  const privacy = usePrivacyMode();
  const historyQuery = useTrackedQueryHistory(siteId, days);
  const trackQuery = useTrackQuery(siteId);

  const { rows, series } = useMemo(() => {
    const tracked = historyQuery.data?.tracked ?? [];
    const history = historyQuery.data?.history ?? [];
    const byDate = new Map<string, ChartRow>();
    for (const row of history) {
      if (row.average_position == null) continue;
      const chartRow = byDate.get(row.metric_date) ?? { date: row.metric_date };
      chartRow[row.query] = privacy.maskNumber(
        row.average_position,
        `tracked:${row.metric_date}:${row.query}`,
        { min: 1, max: 95, decimals: 1 },
      );
      byDate.set(row.metric_date, chartRow);
    }
    const series: ChartSeries[] = tracked.map((t, i) => ({
      key: t.query,
      name: privacy.enabled ? `Query ${i + 1}` : t.query,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
    const rows = [...byDate.values()].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
    return { rows, series };
  }, [historyQuery.data, privacy]);

  if (historyQuery.isLoading) return <Skeleton className="h-40" />;
  const tracked = historyQuery.data?.tracked ?? [];
  if (tracked.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Tracked queries</h2>
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Star className="h-4 w-4" aria-hidden />
            Star a query in the top-terms table below to chart its Google
            position over time.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Tracked queries · position</h2>
      <div className="flex flex-wrap gap-2">
        {tracked.map((t, i) => (
          <span
            key={t.query}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
              }}
            />
            {privacy.enabled ? `Query ${i + 1}` : t.query}
            <button
              type="button"
              aria-label={`Stop tracking ${t.query}`}
              className="text-muted-foreground hover:text-critical"
              disabled={trackQuery.isPending}
              onClick={() =>
                trackQuery.mutate({ query: t.query, track: false })
              }
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Average position (lower is better)</CardTitle>
        </CardHeader>
        <CardContent>
          <MetricLineChart data={rows} series={series} height={200} />
        </CardContent>
      </Card>
    </section>
  );
}
