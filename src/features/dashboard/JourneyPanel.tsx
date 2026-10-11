import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Rocket } from "lucide-react";
import { usePortfolioSessions, useSites } from "@/lib/hooks";
import { analyticsSeries } from "@/lib/series";
import { computeJourneyProgress, journeyStatusLabel } from "@/lib/journey";
import { formatNumber } from "@/lib/format";
import { usePrivacyMode } from "@/lib/privacy";
import { Card } from "@/components/ui/card";
import { JourneyBar } from "@/features/sites/journey-ui";
import type { AnalyticsDaily } from "@/types/database";

// 90 days: a 30-day window plus lead-in for the crossing-date forecast.
const HISTORY_DAYS = 90;

/** Every active site's progress toward the Mediavine Journey minimum. */
export function JourneyPanel() {
  const privacy = usePrivacyMode();
  const sessions = usePortfolioSessions(HISTORY_DAYS);
  const sites = useSites();

  const rows = useMemo(() => {
    const bySite = new Map<string, AnalyticsDaily[]>();
    for (const r of sessions.data ?? []) {
      const list = bySite.get(r.site_id) ?? [];
      list.push(r);
      bySite.set(r.site_id, list);
    }
    return (sites.data ?? [])
      .filter((s) => s.is_active)
      .map((site) => ({
        site,
        progress: computeJourneyProgress(
          analyticsSeries(bySite.get(site.id) ?? [], "sessions"),
        ),
      }))
      .sort((a, b) => b.progress.progress - a.progress.progress);
  }, [sessions.data, sites.data]);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Rocket className="h-4 w-4" aria-hidden />
        Mediavine Journey · 1,000 sessions / 30 days
      </h2>
      <Card className="divide-y divide-border">
        {rows.map(({ site, progress }) => (
          <div
            key={site.id}
            className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[12rem_1fr_14rem]"
          >
            <Link
              to={`/sites/${site.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {privacy.maskText(site.name, `journey:${site.id}:name`)}
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <JourneyBar
                  progress={privacy.enabled ? 0.5 : progress.progress}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatNumber(
                  privacy.maskNumber(progress.current, `journey:${site.id}`),
                )}{" "}
                / {formatNumber(progress.target)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {privacy.enabled ? "********" : journeyStatusLabel(progress)}
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}
