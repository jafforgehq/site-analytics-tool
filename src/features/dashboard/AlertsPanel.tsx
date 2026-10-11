import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, Info, X } from "lucide-react";
import { useAlerts, useDismissAlert, useSites } from "@/lib/hooks";
import { relativeTime } from "@/lib/dates";
import { usePrivacyMode } from "@/lib/privacy";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AlertSeverity } from "@/types/database";

const SEVERITY: Record<
  AlertSeverity,
  { icon: typeof Info; tone: string; label: string }
> = {
  critical: { icon: AlertOctagon, tone: "text-critical", label: "Critical" },
  warning: { icon: AlertTriangle, tone: "text-warning", label: "Warning" },
  info: { icon: Info, tone: "text-primary", label: "Info" },
};

/**
 * Open alerts from the daily check: traffic drops, site down, failing syncs,
 * indexing problems. Renders nothing when everything is quiet.
 */
export function AlertsPanel() {
  const privacy = usePrivacyMode();
  const alerts = useAlerts();
  const sites = useSites();
  const dismiss = useDismissAlert();

  const open = alerts.data ?? [];
  if (open.length === 0) return null;

  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name]));

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Alerts ({open.length})</h2>
      <Card className="divide-y divide-border">
        {open.map((alert) => {
          const { icon: Icon, tone, label } = SEVERITY[alert.severity];
          return (
            <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", tone)}
                aria-label={label}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {privacy.maskText(alert.title, `alert:${alert.id}:title`)}
                </p>
                {alert.detail && (
                  <p className="text-xs text-muted-foreground">
                    {privacy.maskText(alert.detail, `alert:${alert.id}:detail`)}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {alert.site_id && siteName.has(alert.site_id) && (
                    <>
                      <Link
                        to={`/sites/${alert.site_id}`}
                        className="hover:underline"
                      >
                        {privacy.maskText(
                          siteName.get(alert.site_id),
                          `alert:${alert.id}:site`,
                        )}
                      </Link>
                      {" · "}
                    </>
                  )}
                  {relativeTime(alert.created_at)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss alert"
                title="Dismiss"
                disabled={dismiss.isPending || privacy.enabled}
                onClick={() => dismiss.mutate(alert.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </Card>
    </section>
  );
}
