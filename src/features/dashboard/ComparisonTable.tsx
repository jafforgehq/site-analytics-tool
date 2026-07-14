import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { SiteRow } from "@/lib/insights";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/Sparkline";
import { MetricDelta } from "@/components/ui/stat-card";
import { formatCtr, formatNumber, formatPosition } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/lib/privacy";

type SortKey =
  | "name"
  | "sessions"
  | "users"
  | "clicks"
  | "impressions"
  | "ctr"
  | "position";

function sortValue(row: SiteRow, key: SortKey): number | string {
  switch (key) {
    case "name":
      return row.siteName.toLowerCase();
    case "sessions":
      return row.sessions.current;
    case "users":
      return row.users.current;
    case "clicks":
      return row.clicks.current;
    case "impressions":
      return row.impressions.current;
    case "ctr":
      return row.ctr ?? -1;
    case "position":
      return row.position ?? Number.MAX_SAFE_INTEGER;
  }
}

export function ComparisonTable({ sites }: { sites: SiteRow[] }) {
  const privacy = usePrivacyMode();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "clicks",
    dir: "desc",
  });

  const sorted = [...sites].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" || key === "position" ? "asc" : "desc" },
    );

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <Th label="Website" k="name" sort={sort} onSort={toggle} />
              <Th
                label="Sessions"
                k="sessions"
                sort={sort}
                onSort={toggle}
                numeric
              />
              <Th label="Users" k="users" sort={sort} onSort={toggle} numeric />
              <Th
                label="Clicks"
                k="clicks"
                sort={sort}
                onSort={toggle}
                numeric
              />
              <Th
                label="Impr."
                k="impressions"
                sort={sort}
                onSort={toggle}
                numeric
              />
              <Th label="CTR" k="ctr" sort={sort} onSort={toggle} numeric />
              <Th
                label="Pos."
                k="position"
                sort={sort}
                onSort={toggle}
                numeric
              />
              <th className="px-3 py-2.5 font-medium">30d trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.siteId}
                className="border-b border-border last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to={`/sites/${s.siteId}`}
                    className="font-medium hover:underline"
                  >
                    {privacy.maskText(s.siteName, `site:${s.siteId}:name`)}
                  </Link>
                </td>
                <NumCell
                  value={privacy.maskNumber(
                    s.sessions.current,
                    `${s.siteId}:sessions`,
                  )}
                  pct={s.sessions.pct}
                />
                <NumCell
                  value={privacy.maskNumber(
                    s.users.current,
                    `${s.siteId}:users`,
                  )}
                  pct={s.users.pct}
                />
                <NumCell
                  value={privacy.maskNumber(
                    s.clicks.current,
                    `${s.siteId}:clicks`,
                  )}
                  pct={s.clicks.pct}
                />
                <NumCell
                  value={privacy.maskNumber(
                    s.impressions.current,
                    `${s.siteId}:impressions`,
                  )}
                  pct={s.impressions.pct}
                />
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCtr(
                    privacy.maskNumber(s.ctr, `${s.siteId}:ctr`, {
                      min: 0,
                      max: 0.4,
                      decimals: 4,
                    }),
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatPosition(
                    privacy.maskNumber(s.position, `${s.siteId}:position`, {
                      min: 1,
                      max: 95,
                      decimals: 1,
                    }),
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Sparkline
                    data={s.sparkline.map(
                      (value, index) =>
                        privacy.maskNumber(
                          value,
                          `${s.siteId}:sparkline:${index}`,
                        ) ?? 0,
                    )}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({
  label,
  k,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={cn("px-3 py-2.5 font-medium", numeric && "text-right")}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}

function NumCell({ value, pct }: { value: number | null; pct: number | null }) {
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <div>{formatNumber(value)}</div>
      <div className="text-[11px]">
        <MetricDelta change={pct} compact />
      </div>
    </td>
  );
}
