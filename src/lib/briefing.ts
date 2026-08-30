// Builds the compact JSON summary the ai-briefing Edge Function sends to the
// model. Only aggregate numbers and names the admin can already read via RLS -
// no raw rows, no identifiers beyond site names/domains - and hard-capped in
// size so the server's payload limit is never hit.

import type { InsightsResult } from "@/lib/insights";
import type { DecayRow } from "@/lib/decay";
import type { GoalProjection } from "@/lib/forecast";
import type { SiteGoal } from "@/types/database";

const MAX_SITES = 20;
const MAX_MOVERS = 5;
const MAX_INSIGHTS = 10;
const MAX_DECAYS = 8;

export interface GoalWithProjection {
  goal: SiteGoal;
  siteName: string;
  projection: GoalProjection;
}

function round(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

export function buildBriefingSummary(
  insights: InsightsResult,
  decays: Array<DecayRow & { siteName: string }>,
  goals: GoalWithProjection[],
): Record<string, unknown> {
  return {
    period_days: insights.days,
    health: insights.health,
    kpis: {
      clicks: {
        current: insights.kpis.clicks.current,
        change_pct: round(insights.kpis.clicks.pct),
      },
      impressions: {
        current: insights.kpis.impressions.current,
        change_pct: round(insights.kpis.impressions.pct),
      },
      sessions: {
        current: insights.kpis.sessions.current,
        change_pct: round(insights.kpis.sessions.pct),
      },
      users: {
        current: insights.kpis.users.current,
        change_pct: round(insights.kpis.users.pct),
      },
    },
    sites: insights.sites.slice(0, MAX_SITES).map((site) => ({
      name: site.siteName,
      clicks: site.clicks.current,
      clicks_change_pct: round(site.clicks.pct),
      sessions: site.sessions.current,
      sessions_change_pct: round(site.sessions.pct),
      position: round(site.position),
      anomaly: site.anomaly
        ? { date: site.anomaly.date, z: round(site.anomaly.z) }
        : null,
    })),
    top_gainers: insights.movers.gainers.slice(0, MAX_MOVERS).map((site) => ({
      name: site.siteName,
      clicks_change_pct: round(site.clicks.pct),
    })),
    top_decliners: insights.movers.decliners
      .slice(0, MAX_MOVERS)
      .map((site) => ({
        name: site.siteName,
        clicks_change_pct: round(site.clicks.pct),
      })),
    action_items: insights.insights.slice(0, MAX_INSIGHTS).map((item) => ({
      severity: item.severity,
      title: item.title,
    })),
    coverage_gaps: insights.coverage
      .filter((row) => row.hasGap)
      .map((row) => ({
        site: row.siteName,
        source: row.source,
        stale_days: row.staleDays,
      })),
    decaying_pages: decays.slice(0, MAX_DECAYS).map((row) => ({
      site: row.siteName,
      page: row.page,
      clicks_change_pct: round(row.changePct),
      previous_clicks: row.previousClicks,
    })),
    goals: goals.map(({ goal, siteName, projection }) => ({
      site: siteName,
      metric: goal.metric,
      target: goal.target_value,
      target_date: goal.target_date,
      status: projection.status,
      current: Math.round(projection.currentValue),
      projected:
        projection.projectedValue == null
          ? null
          : Math.round(projection.projectedValue),
    })),
  };
}
