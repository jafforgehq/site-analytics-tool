import type { InsightsResult } from "@/lib/insights";
import { StatCard, MetricDelta } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/format";
import { usePrivacyMode } from "@/lib/privacy";

export function PortfolioKpis({ data }: { data: InsightsResult }) {
  const privacy = usePrivacyMode();
  const { kpis, engineSplit } = data;
  const googleClicks =
    privacy.maskNumber(engineSplit.google, "portfolio:google-clicks") ?? 0;
  const bingClicks =
    privacy.maskNumber(engineSplit.bing, "portfolio:bing-clicks") ?? 0;
  const totalClicks = googleClicks + bingClicks;
  const bingShare =
    totalClicks > 0 ? Math.round((bingClicks / totalClicks) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Search clicks"
        value={formatNumber(
          privacy.maskNumber(kpis.clicks.current, "portfolio:clicks"),
        )}
        hint={<MetricDelta change={kpis.clicks.pct} />}
      />
      <StatCard
        label="Impressions"
        value={formatNumber(
          privacy.maskNumber(kpis.impressions.current, "portfolio:impressions"),
        )}
        hint={<MetricDelta change={kpis.impressions.pct} />}
      />
      <StatCard
        label="Active users"
        value={formatNumber(
          privacy.maskNumber(kpis.users.current, "portfolio:users"),
        )}
        hint={<MetricDelta change={kpis.users.pct} />}
      />
      <StatCard
        label="Sessions"
        value={formatNumber(
          privacy.maskNumber(kpis.sessions.current, "portfolio:sessions"),
        )}
        hint={
          totalClicks > 0 ? (
            <span className="text-muted-foreground">
              Bing = {bingShare}% of clicks
            </span>
          ) : (
            <MetricDelta change={kpis.sessions.pct} />
          )
        }
      />
    </div>
  );
}
