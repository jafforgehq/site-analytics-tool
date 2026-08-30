import { useMemo } from "react";
import {
  combineAnalyticsAcrossSites,
  combineSearchAcrossSites,
  computeTrajectories,
} from "@/lib/series";
import { useAnnotations } from "@/lib/hooks";
import { usePrivacyMode } from "@/lib/privacy";
import { TrajectoryPanel } from "@/components/charts/TrajectoryPanel";
import type { AnalyticsDaily, SearchDaily } from "@/types/database";

const HORIZON_DAYS = 28;

/**
 * Portfolio-wide trajectory: every active site's daily rows summed into one
 * combined series per metric, then forecast the same way as a single site.
 * Only portfolio-wide annotations are shown (a single site's own events would
 * be misleading markers on a combined chart).
 */
export function PortfolioTrajectorySection({
  analytics,
  search,
}: {
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
}) {
  const privacy = usePrivacyMode();
  const annotationsQuery = useAnnotations();

  const trajectories = useMemo(() => {
    const combinedAnalytics = combineAnalyticsAcrossSites(analytics);
    const combinedSearch = combineSearchAcrossSites(search);
    return computeTrajectories(combinedAnalytics, combinedSearch, HORIZON_DAYS);
  }, [analytics, search]);

  const annotations = (annotationsQuery.data ?? [])
    .filter((a) => a.site_id == null)
    .map((a) => ({
      date: a.event_date,
      label: privacy.enabled ? "•" : a.label,
    }));

  return (
    <TrajectoryPanel
      title={`Portfolio trajectory · next ${HORIZON_DAYS} days`}
      trajectories={trajectories}
      annotations={annotations}
      horizonDays={HORIZON_DAYS}
      maskPrefix="traj:portfolio"
    />
  );
}
