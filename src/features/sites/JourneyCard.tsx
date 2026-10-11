import { useMemo } from "react";
import { Rocket } from "lucide-react";
import { useSiteMetrics } from "@/lib/hooks";
import { premiumSessionsSeries } from "@/lib/series";
import { computeJourneyProgress } from "@/lib/journey";
import { formatNumber } from "@/lib/format";
import { usePrivacyMode } from "@/lib/privacy";
import { Card, CardContent } from "@/components/ui/card";
import { JourneyBar, JourneyStatusText } from "@/features/sites/journey-ui";

/** Progress toward the Mediavine Journey session minimum for one site. */
export function JourneyCard({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  // 45 days fetches ~90 days of history: a 30-day window plus enough
  // lead-in for the forecast that projects the crossing date.
  const metrics = useSiteMetrics(siteId, 45);
  const progress = useMemo(
    () =>
      computeJourneyProgress(
        premiumSessionsSeries(metrics.data?.analytics ?? []),
      ),
    [metrics.data],
  );

  if (metrics.isLoading || progress.status === "no_data") return null;

  const current =
    privacy.maskNumber(progress.current, `journey:${siteId}`) ?? 0;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Rocket className="h-4 w-4" aria-hidden />
          Mediavine Journey · premium sessions, 30 days
        </span>
        <p className="text-2xl font-semibold tabular-nums">
          {formatNumber(current)}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}
            / {formatNumber(progress.target)} premium sessions
          </span>
        </p>
        <JourneyBar progress={privacy.enabled ? 0.5 : progress.progress} />
        <p className="text-xs text-muted-foreground">
          {privacy.enabled ? (
            "********"
          ) : (
            <JourneyStatusText progress={progress} />
          )}
        </p>
      </CardContent>
    </Card>
  );
}
