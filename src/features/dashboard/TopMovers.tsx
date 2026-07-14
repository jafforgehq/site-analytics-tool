import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { SiteRow } from "@/lib/insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercentChange } from "@/lib/format";
import { usePrivacyMode } from "@/lib/privacy";

export function TopMovers({
  gainers,
  decliners,
}: {
  gainers: SiteRow[];
  decliners: SiteRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top movers - clicks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MoverList title="Gainers" rows={gainers} good />
        <MoverList title="Decliners" rows={decliners} good={false} />
      </CardContent>
    </Card>
  );
}

function MoverList({
  title,
  rows,
  good,
}: {
  title: string;
  rows: SiteRow[];
  good: boolean;
}) {
  const privacy = usePrivacyMode();
  const Icon = good ? ArrowUpRight : ArrowDownRight;
  const tone = good ? "text-success" : "text-critical";
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No meaningful change.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((s) => (
            <li
              key={s.siteId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <Link
                to={`/sites/${s.siteId}`}
                className="truncate font-medium hover:underline"
              >
                {privacy.maskText(s.siteName, `mover:${s.siteId}:name`)}
              </Link>
              <span className={`flex items-center gap-1 ${tone}`}>
                <Icon className="h-3 w-3" />
                {formatPercentChange(
                  privacy.maskNumber(s.clicks.pct, `mover:${s.siteId}:pct`, {
                    min: -80,
                    max: 130,
                    decimals: 1,
                  }),
                )}
                <span className="text-muted-foreground">
                  (
                  {formatNumber(
                    privacy.maskNumber(
                      s.clicks.current,
                      `mover:${s.siteId}:clicks`,
                    ),
                  )}
                  )
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
