import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { forecastSeries } from "@/lib/forecast";
import { clicksSeries, sessionsSeries } from "@/lib/series";
import { formatNumber, formatPercentChange } from "@/lib/format";
import { useAnnotations } from "@/lib/hooks";
import { usePrivacyMode } from "@/lib/privacy";
import type { AnalyticsDaily, SearchDaily } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  MetricLineChart,
  type ChartRow,
} from "@/components/charts/MetricLineChart";
import { CHART_COLORS } from "@/components/charts/chart-colors";

const HORIZON_DAYS = 28;

/**
 * Trajectory: observed daily series plus a Holt-Winters forecast with an 80%
 * band. Uses ALL fetched history (2× the visible window) for a better fit.
 */
export function TrajectorySection({
  siteId,
  analytics,
  search,
}: {
  siteId: string;
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
}) {
  const privacy = usePrivacyMode();
  const annotationsQuery = useAnnotations(siteId);

  const clicks = useMemo(() => clicksSeries(search), [search]);
  const sessions = useMemo(() => sessionsSeries(analytics), [analytics]);

  const clicksForecast = useMemo(
    () => forecastSeries(clicks, HORIZON_DAYS),
    [clicks],
  );
  const sessionsForecast = useMemo(
    () => forecastSeries(sessions, HORIZON_DAYS),
    [sessions],
  );

  const primary = clicksForecast ?? sessionsForecast;
  if (!primary) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Trajectory</h2>
        <EmptyState
          icon={TrendingUp}
          title="Not enough history to forecast"
          description="Forecasts appear once at least 8 days of data are stored; a full weekly pattern needs 21."
        />
      </section>
    );
  }

  const useClicks = clicksForecast != null;
  const observed = useClicks ? clicks : sessions;
  const forecast = useClicks ? clicksForecast! : sessionsForecast!;
  const metricName = useClicks ? "Google clicks" : "Sessions";

  // Observed rows, then forecast rows (dashed line + band). The last observed
  // point is duplicated into the forecast series so the lines join.
  const shown = observed.slice(-60);
  const rows: ChartRow[] = shown.map((p) => ({
    date: p.date,
    [metricName]: privacy.maskNumber(p.value, `traj:${p.date}:obs`),
  }));
  const last = shown[shown.length - 1];
  if (last) {
    rows[rows.length - 1].Forecast = privacy.maskNumber(
      last.value,
      `traj:${last.date}:obs`,
    );
  }
  for (const p of forecast.points) {
    const value = privacy.maskNumber(p.value, `traj:${p.date}:fc`) ?? 0;
    const lower = privacy.maskNumber(p.lower, `traj:${p.date}:lo`) ?? 0;
    const upper = privacy.maskNumber(p.upper, `traj:${p.date}:hi`) ?? 0;
    rows.push({
      date: p.date,
      Forecast: value,
      band: [Math.min(lower, upper), Math.max(lower, upper)] as [
        number,
        number,
      ],
    });
  }

  const annotations = (annotationsQuery.data ?? []).map((a) => ({
    date: a.event_date,
    label: privacy.enabled ? "•" : a.label,
  }));

  const trendPerWeek = forecast.trendPerDay * 7;
  const trendPct =
    last && last.value > 0 ? (trendPerWeek / last.value) * 100 : null;
  const horizonTotal =
    privacy.maskNumber(
      Math.round(forecast.horizonTotal),
      "traj:horizon-total",
    ) ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        Trajectory · next {HORIZON_DAYS} days
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={`Projected ${metricName.toLowerCase()} (next ${HORIZON_DAYS}d)`}
          value={formatNumber(Math.round(horizonTotal))}
          hint={
            <span className="text-muted-foreground">
              {forecast.method === "holt-winters"
                ? "weekly-seasonal model"
                : "linear trend (short history)"}
            </span>
          }
        />
        <StatCard
          label="Trend per week"
          value={
            <span
              className={trendPerWeek >= 0 ? "text-success" : "text-critical"}
            >
              {trendPerWeek >= 0 ? "+" : ""}
              {formatNumber(
                Math.round(
                  privacy.maskNumber(trendPerWeek, "traj:trend-week") ?? 0,
                ),
              )}
            </span>
          }
          hint={
            trendPct != null ? (
              <span className="text-muted-foreground">
                {formatPercentChange(privacy.enabled ? null : trendPct)} of
                current daily level
              </span>
            ) : undefined
          }
        />
        <StatCard
          label="Forecast uncertainty"
          value={`±${formatNumber(
            Math.round(
              privacy.maskNumber(
                1.28 * forecast.residualStd,
                "traj:uncertainty",
              ) ?? 0,
            ),
          )}`}
          hint={
            <span className="text-muted-foreground">80% band, per day</span>
          }
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{metricName}: observed &amp; forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <MetricLineChart
            data={rows}
            bandKey="band"
            annotations={annotations}
            series={[
              {
                key: metricName,
                name: metricName,
                color: CHART_COLORS.primary,
              },
              {
                key: "Forecast",
                name: "Forecast",
                color: CHART_COLORS.violet,
                dashed: true,
              },
            ]}
          />
        </CardContent>
      </Card>
    </section>
  );
}
