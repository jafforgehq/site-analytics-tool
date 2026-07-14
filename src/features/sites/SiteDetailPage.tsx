import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Pencil } from "lucide-react";
import { useSite, useSiteMetrics, useSyncRuns } from "@/lib/hooks";
import { computeHealth } from "@/lib/health";
import {
  percentageChange,
  splitPeriods,
  sumAnalytics,
  sumBy,
  weightedAveragePosition,
  weightedCtr,
  type AnalyticsMetricKey,
} from "@/lib/metrics";
import { SOURCE_LABEL } from "@/lib/sources";
import { formatCtr, formatNumber, formatPosition } from "@/lib/format";
import { relativeTime, absoluteTime } from "@/lib/dates";
import type { AnalyticsDaily, SearchDaily } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, MetricDelta } from "@/components/ui/stat-card";
import { HealthBadge } from "@/components/status/HealthBadge";
import {
  MetricLineChart,
  type ChartRow,
} from "@/components/charts/MetricLineChart";
import { CHART_COLORS } from "@/components/charts/chart-colors";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncRunsTable } from "@/features/sync-runs/SyncRunsTable";
import { ManualSyncButtons } from "@/features/sites/ManualSyncButtons";
import { SiteFormDialog } from "@/features/sites/SiteFormDialog";
import { SearchTermsSection } from "@/features/sites/SearchTermsSection";
import { SiteReportExportButton } from "@/features/sites/SiteReportExportButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";

const RANGES = [7, 30, 90, 180, 360] as const;

const GA4_METRICS: { key: AnalyticsMetricKey; label: string }[] = [
  { key: "active_users", label: "Active users" },
  { key: "total_users", label: "Total users" },
  { key: "sessions", label: "Sessions" },
  { key: "screen_page_views", label: "Page views" },
  { key: "engaged_sessions", label: "Engaged sessions" },
];

/** Merge Google + Bing daily rows into one date-keyed series for the charts. */
function buildSearchChartData(
  googleCurrent: SearchDaily[],
  bingCurrent: SearchDaily[],
): ChartRow[] {
  const map = new Map<string, ChartRow>();
  for (const r of googleCurrent) {
    map.set(r.metric_date, {
      date: r.metric_date,
      "Google clicks": r.clicks,
      "Google impressions": r.impressions,
    });
  }
  for (const r of bingCurrent) {
    const row = map.get(r.metric_date) ?? { date: r.metric_date };
    row["Bing clicks"] = r.clicks;
    row["Bing impressions"] = r.impressions;
    map.set(r.metric_date, row);
  }
  return [...map.values()].sort((x, y) =>
    x.date < y.date ? -1 : x.date > y.date ? 1 : 0,
  );
}

export function SiteDetailPage() {
  const privacy = usePrivacyMode();
  const { siteId = "" } = useParams();
  const navigate = useNavigate();
  const [days, setDays] = useState<number>(30);
  const [editing, setEditing] = useState(false);

  const siteQuery = useSite(siteId);
  const metricsQuery = useSiteMetrics(siteId, days);
  const runsQuery = useSyncRuns({ siteId, limit: 10 });

  if (siteQuery.isLoading) return <DetailSkeleton />;
  if (siteQuery.isError)
    return <ErrorState onRetry={() => void siteQuery.refetch()} />;
  if (!siteQuery.data)
    return (
      <EmptyState
        title="Site not found"
        description="This website may have been removed."
        action={
          <Link to="/sites" className="text-sm text-primary hover:underline">
            Back to sites
          </Link>
        }
      />
    );

  const site = siteQuery.data;
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {privacy.maskText(site.name, `site-detail:${site.id}:name`)}
          </h1>
          <a
            href={privacy.enabled ? "#" : site.website_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {privacy.maskText(site.domain, `site-detail:${site.id}:domain`)}{" "}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <SiteReportExportButton site={site} />
          <Button
            variant="secondary"
            size="sm"
            disabled={privacy.enabled}
            title={
              privacy.enabled
                ? "Turn off Hide all data to edit site settings."
                : undefined
            }
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
          <RangeSelector days={days} onChange={setDays} />
        </div>
      </div>

      {editing && (
        <SiteFormDialog
          mode="edit"
          site={site}
          onClose={() => setEditing(false)}
          onDeleted={() => navigate("/sites", { replace: true })}
        />
      )}

      {/* Integration health */}
      <div className="grid gap-3 sm:grid-cols-3">
        {site.statuses.map((status) => {
          const health = computeHealth(status, now);
          return (
            <Card key={status.source}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {SOURCE_LABEL[status.source]}
                  </span>
                  <HealthBadge health={health} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {privacy.enabled ? "********" : health.reason}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  title={
                    privacy.enabled
                      ? "********"
                      : absoluteTime(status.last_success_at)
                  }
                >
                  Last success{" "}
                  {privacy.enabled
                    ? "********"
                    : relativeTime(status.last_success_at)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ManualSyncButtons site={site} />

      {metricsQuery.isLoading ? (
        <Skeleton className="h-64" />
      ) : metricsQuery.isError ? (
        <ErrorState onRetry={() => void metricsQuery.refetch()} />
      ) : (
        <MetricsSection
          days={days}
          analytics={metricsQuery.data?.analytics ?? []}
          search={metricsQuery.data?.search ?? []}
        />
      )}

      {/* Top queries & pages */}
      <SearchTermsSection siteId={siteId} days={days} />

      {/* Recent runs */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recent sync runs</h2>
        {runsQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : runsQuery.data && runsQuery.data.length > 0 ? (
          <SyncRunsTable runs={runsQuery.data} hideSite />
        ) : (
          <EmptyState title="No sync runs yet" />
        )}
      </section>
    </div>
  );
}

function MetricsSection({
  days,
  analytics,
  search,
}: {
  days: number;
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
}) {
  const privacy = usePrivacyMode();
  const google = useMemo(
    () => search.filter((r) => r.engine === "google"),
    [search],
  );
  const bing = useMemo(
    () => search.filter((r) => r.engine === "bing"),
    [search],
  );

  const ga = splitPeriods(analytics, days);
  const g = splitPeriods(google, days);
  const b = splitPeriods(bing, days);

  // Search aggregates
  const gClicks = sumBy(g.current, (r) => r.clicks);
  const gImpr = sumBy(g.current, (r) => r.impressions);
  const gClicksPrev = sumBy(g.previous, (r) => r.clicks);
  const gImprPrev = sumBy(g.previous, (r) => r.impressions);
  const gCtr = weightedCtr(gClicks, gImpr);
  const gCtrPrev = weightedCtr(gClicksPrev, gImprPrev);
  const gPos = weightedAveragePosition(g.current);

  const bClicks = sumBy(b.current, (r) => r.clicks);
  const bImpr = sumBy(b.current, (r) => r.impressions);
  const bClicksPrev = sumBy(b.previous, (r) => r.clicks);
  const bImprPrev = sumBy(b.previous, (r) => r.impressions);

  // Chart data
  const trafficData: ChartRow[] = ga.current.map((r) => ({
    date: r.metric_date,
    "Active users": privacy.maskNumber(
      r.active_users,
      `chart:${r.metric_date}:active-users`,
    ),
    Sessions: privacy.maskNumber(r.sessions, `chart:${r.metric_date}:sessions`),
  }));

  const searchByDate = buildSearchChartData(g.current, b.current).map(
    (row) => ({
      ...row,
      "Google clicks": privacy.maskNumber(
        Number(row["Google clicks"] ?? 0),
        `chart:${row.date}:google-clicks`,
      ),
      "Google impressions": privacy.maskNumber(
        Number(row["Google impressions"] ?? 0),
        `chart:${row.date}:google-impressions`,
      ),
      "Bing clicks": privacy.maskNumber(
        Number(row["Bing clicks"] ?? 0),
        `chart:${row.date}:bing-clicks`,
      ),
      "Bing impressions": privacy.maskNumber(
        Number(row["Bing impressions"] ?? 0),
        `chart:${row.date}:bing-impressions`,
      ),
    }),
  );

  return (
    <div className="space-y-6">
      {/* GA4 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Google Analytics · last {days} days
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {GA4_METRICS.map(({ key, label }) => {
            const cur = sumAnalytics(ga.current, key);
            const prev = sumAnalytics(ga.previous, key);
            return (
              <StatCard
                key={key}
                label={label}
                value={formatNumber(
                  privacy.maskNumber(cur, `ga-card:${days}:${key}`),
                )}
                hint={<MetricDelta change={percentageChange(cur, prev)} />}
              />
            );
          })}
        </div>
        <EngagementQuality rows={ga.current} />
        <Card>
          <CardHeader>
            <CardTitle>Users &amp; sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricLineChart
              data={trafficData}
              series={[
                {
                  key: "Active users",
                  name: "Active users",
                  color: CHART_COLORS.primary,
                },
                {
                  key: "Sessions",
                  name: "Sessions",
                  color: CHART_COLORS.violet,
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* Search */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Search · last {days} days</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Google clicks"
            value={formatNumber(
              privacy.maskNumber(gClicks, `search:${days}:google-clicks`),
            )}
            hint={
              <MetricDelta change={percentageChange(gClicks, gClicksPrev)} />
            }
          />
          <StatCard
            label="Google impressions"
            value={formatNumber(
              privacy.maskNumber(gImpr, `search:${days}:google-impressions`),
            )}
            hint={<MetricDelta change={percentageChange(gImpr, gImprPrev)} />}
          />
          <StatCard
            label="Google CTR"
            value={formatCtr(
              privacy.maskNumber(gCtr, `search:${days}:google-ctr`, {
                min: 0,
                max: 0.4,
                decimals: 4,
              }),
            )}
            hint={
              <MetricDelta
                change={
                  gCtr != null && gCtrPrev != null
                    ? percentageChange(gCtr, gCtrPrev)
                    : null
                }
              />
            }
          />
          <StatCard
            label="Avg. position"
            value={formatPosition(
              privacy.maskNumber(gPos, `search:${days}:google-position`, {
                min: 1,
                max: 95,
                decimals: 1,
              }),
            )}
            hint={
              <span className="text-muted-foreground">lower is better</span>
            }
          />
          <StatCard
            label="Bing clicks"
            value={formatNumber(
              privacy.maskNumber(bClicks, `search:${days}:bing-clicks`),
            )}
            hint={
              <MetricDelta change={percentageChange(bClicks, bClicksPrev)} />
            }
          />
          <StatCard
            label="Bing impressions"
            value={formatNumber(
              privacy.maskNumber(bImpr, `search:${days}:bing-impressions`),
            )}
            hint={<MetricDelta change={percentageChange(bImpr, bImprPrev)} />}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Clicks</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricLineChart
                data={searchByDate}
                series={[
                  {
                    key: "Google clicks",
                    name: "Google",
                    color: CHART_COLORS.emerald,
                  },
                  {
                    key: "Bing clicks",
                    name: "Bing",
                    color: CHART_COLORS.amber,
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Impressions</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricLineChart
                data={searchByDate}
                series={[
                  {
                    key: "Google impressions",
                    name: "Google",
                    color: CHART_COLORS.emerald,
                  },
                  {
                    key: "Bing impressions",
                    name: "Bing",
                    color: CHART_COLORS.amber,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

/** Derived GA4 quality ratios that the raw counts don't show directly (#6). */
function EngagementQuality({ rows }: { rows: AnalyticsDaily[] }) {
  const privacy = usePrivacyMode();
  const sessions =
    privacy.maskNumber(sumAnalytics(rows, "sessions"), "engagement:sessions") ??
    0;
  const users =
    privacy.maskNumber(
      sumAnalytics(rows, "active_users"),
      "engagement:users",
    ) ?? 0;
  const pv =
    privacy.maskNumber(
      sumAnalytics(rows, "screen_page_views"),
      "engagement:pv",
    ) ?? 0;
  const eng =
    privacy.maskNumber(
      sumAnalytics(rows, "engaged_sessions"),
      "engagement:engaged",
    ) ?? 0;
  const engagementRate = sessions > 0 ? eng / sessions : null;
  const pagesPerSession = sessions > 0 ? pv / sessions : null;
  const sessionsPerUser = users > 0 ? sessions / users : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        label="Engagement rate"
        value={formatCtr(engagementRate)}
        hint={<span className="text-muted-foreground">engaged ÷ sessions</span>}
      />
      <StatCard
        label="Pages / session"
        value={pagesPerSession != null ? pagesPerSession.toFixed(1) : "-"}
      />
      <StatCard
        label="Sessions / user"
        value={sessionsPerUser != null ? sessionsPerUser.toFixed(1) : "-"}
      />
    </div>
  );
}

function RangeSelector({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors",
            days === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r}d
        </button>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
