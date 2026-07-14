import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useInsights } from "@/lib/hooks";
import type { SiteWithStatuses } from "@/lib/api";
import { computeHealth } from "@/lib/health";
import { SOURCES, SOURCE_SHORT, SOURCE_LABEL } from "@/lib/sources";
import { relativeTime, absoluteTime } from "@/lib/dates";
import type { SyncSource } from "@/types/database";
import { HealthIcon } from "@/components/status/HealthBadge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PortfolioKpis } from "@/features/dashboard/PortfolioKpis";
import { InsightsFeed } from "@/features/dashboard/InsightsFeed";
import { TopMovers } from "@/features/dashboard/TopMovers";
import { ComparisonTable } from "@/features/dashboard/ComparisonTable";
import { CoveragePanel } from "@/features/dashboard/CoveragePanel";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";

const RANGES = [7, 30, 90, 180, 360] as const;

export function OverviewPage() {
  const privacy = usePrivacyMode();
  const [days, setDays] = useState<number>(30);
  const insights = useInsights(days);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Portfolio overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Traffic, search performance, and what needs your attention.
          </p>
        </div>
        <RangeSelector days={days} onChange={setDays} />
      </div>

      {/* Data + insights (range-driven) */}
      {insights.isLoading ? (
        <DataSkeleton />
      ) : insights.isError || !insights.data ? (
        <ErrorState onRetry={() => void insights.refetch()} />
      ) : insights.data.sites.length === 0 ? (
        <EmptyState
          title="No active sites yet"
          description="Add a site to start seeing portfolio insights."
        />
      ) : (
        <>
          {insights.data.health.attention > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <span className="font-medium">
                  {privacy.enabled
                    ? privacy.maskNumber(
                        insights.data.health.attention,
                        "overview:attention",
                      )
                    : insights.data.health.attention}{" "}
                  integration
                  {insights.data.health.attention === 1 ? "" : "s"} need
                  attention
                </span>
                {insights.data.health.critical > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    {privacy.enabled
                      ? privacy.maskNumber(
                          insights.data.health.critical,
                          "overview:critical",
                        )
                      : insights.data.health.critical}{" "}
                    critical
                  </span>
                )}
              </div>
            </div>
          )}

          <PortfolioKpis data={insights.data} />

          <div className="grid gap-3 lg:grid-cols-2">
            <InsightsFeed insights={insights.data.insights} />
            <div className="space-y-3">
              <TopMovers
                gainers={insights.data.movers.gainers}
                decliners={insights.data.movers.decliners}
              />
              <CoveragePanel coverage={insights.data.coverage} />
            </div>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">
              All sites · last {days} days
            </h2>
            <ComparisonTable sites={insights.data.sites} />
          </section>
        </>
      )}

      {/* Sync health - sourced from the same insights query (no extra fetch) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Integration health</h2>
        {insights.isLoading ? (
          <Skeleton className="h-32" />
        ) : insights.isError || !insights.data ? (
          <ErrorState onRetry={() => void insights.refetch()} />
        ) : insights.data.sitesWithStatuses.length === 0 ? null : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Website</th>
                    {SOURCES.map((s) => (
                      <th key={s} className="px-3 py-3 text-center font-medium">
                        {SOURCE_SHORT[s]}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium">
                      Last successful sync
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.data.sitesWithStatuses.map((site) => (
                    <HealthRow key={site.id} site={site} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function HealthRow({ site }: { site: SiteWithStatuses }) {
  const privacy = usePrivacyMode();
  const now = new Date();
  const lastSuccess = site.statuses
    .map((s) => s.last_success_at)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3">
        <Link to={`/sites/${site.id}`} className="font-medium hover:underline">
          {privacy.maskText(site.name, `overview-health:${site.id}:name`)}
        </Link>
        <div className="text-xs text-muted-foreground">
          {privacy.maskText(site.domain, `overview-health:${site.id}:domain`)}
        </div>
      </td>
      {SOURCES.map((source) => (
        <td key={source} className="px-3 py-3 text-center">
          <IntegrationCell site={site} source={source} now={now} />
        </td>
      ))}
      <td
        className="px-4 py-3"
        title={privacy.enabled ? "********" : absoluteTime(lastSuccess)}
      >
        {privacy.enabled ? "********" : relativeTime(lastSuccess)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={`/sites/${site.id}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

function IntegrationCell({
  site,
  source,
  now,
}: {
  site: SiteWithStatuses;
  source: SyncSource;
  now: Date;
}) {
  const privacy = usePrivacyMode();
  const status = site.statuses.find((s) => s.source === source);
  if (!status) return <span className="text-muted-foreground">-</span>;
  const health = computeHealth(status, now);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <HealthIcon health={health} label={SOURCE_LABEL[source]} />
      <span className="text-[10px] text-muted-foreground">
        {privacy.enabled
          ? "********"
          : status.last_success_at
            ? relativeTime(status.last_success_at)
            : "-"}
      </span>
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

function DataSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}
