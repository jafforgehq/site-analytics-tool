import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { CoverageRow } from "@/lib/insights";
import { SOURCE_LABEL } from "@/lib/sources";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrivacyMode } from "@/lib/privacy";

export function CoveragePanel({ coverage }: { coverage: CoverageRow[] }) {
  const privacy = usePrivacyMode();
  const gaps = coverage.filter((c) => c.hasGap);
  const current = coverage.length - gaps.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Data coverage</CardTitle>
        <span className="text-xs text-muted-foreground">
          {privacy.enabled
            ? `${privacy.maskNumber(current, "coverage:current")}/${privacy.maskNumber(
                coverage.length,
                "coverage:total",
              )}`
            : `${current}/${coverage.length}`}{" "}
          feeds current
        </span>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Every enabled feed has recent data.
          </div>
        ) : (
          <ul className="space-y-2">
            {gaps.map((c) => (
              <li
                key={`${c.siteId}-${c.source}`}
                className="flex items-start gap-2 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <span className="font-medium">
                    {privacy.maskText(c.siteName, `coverage:${c.siteId}:name`)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    · {SOURCE_LABEL[c.source]}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {privacy.enabled
                      ? "Last data ********"
                      : c.lastDataDate
                        ? `Last data ${c.lastDataDate} (${c.staleDays}d ago)`
                        : "No data on record"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
