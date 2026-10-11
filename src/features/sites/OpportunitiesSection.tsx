import { useMemo, useState, type ReactNode } from "react";
import { useQueryPageSnapshot, useSiteQueryDaily } from "@/lib/hooks";
import {
  aggregateQueries,
  findCannibalization,
  findCtrGaps,
  findStrikingDistance,
} from "@/lib/opportunities";
import { formatCtr, formatNumber, formatPosition } from "@/lib/format";
import { shortPath } from "@/lib/url";
import { usePrivacyMode } from "@/lib/privacy";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = 28;

type Tab = "striking" | "ctr" | "cannibal";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: "striking",
    label: "Almost page 1",
    blurb:
      "Ranking 8-20 with real demand. A content refresh or a few internal links often tips these onto page one.",
  },
  {
    id: "ctr",
    label: "Weak snippets",
    blurb:
      "On page one but clicked far less than that position normally earns. Rewrite the title and meta description.",
  },
  {
    id: "cannibal",
    label: "Competing pages",
    blurb:
      "One query is showing several of your own pages, splitting clicks. Merge them or point one at the other.",
  },
];

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-3 py-2 font-medium", right && "text-right")}>
      {children}
    </th>
  );
}

export function OpportunitiesSection({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  const [tab, setTab] = useState<Tab>("striking");
  const queryRows = useSiteQueryDaily(siteId, WINDOW_DAYS);
  const snapshot = useQueryPageSnapshot(siteId);

  const stats = useMemo(
    () => aggregateQueries(queryRows.data ?? [], WINDOW_DAYS),
    [queryRows.data],
  );
  const striking = useMemo(() => findStrikingDistance(stats), [stats]);
  const gaps = useMemo(() => findCtrGaps(stats), [stats]);
  const cannibal = useMemo(
    () => findCannibalization(snapshot.data ?? []),
    [snapshot.data],
  );

  if (queryRows.isLoading) return <Skeleton className="h-48" />;
  if (queryRows.isError) return null;

  const counts: Record<Tab, number> = {
    striking: striking.length,
    ctr: gaps.length,
    cannibal: cannibal.length,
  };
  const active = TABS.find((t) => t.id === tab)!;
  const n = (v: number, key: string) =>
    formatNumber(privacy.maskNumber(v, `opp:${siteId}:${key}`));
  const text = (v: string, key: string) =>
    privacy.maskText(v, `opp:${siteId}:${key}`);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Opportunities · last {WINDOW_DAYS} days
        </h2>
        <div
          className="inline-flex rounded-md border border-border p-0.5"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} ({counts[t.id]})
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{active.blurb}</p>

      {counts[tab] === 0 ? (
        <EmptyState
          title="Nothing to flag"
          description={
            tab === "cannibal" && (snapshot.data ?? []).length === 0
              ? "Query-and-page data arrives with the next Search Console sync."
              : "No queries match this pattern right now."
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {tab === "striking" && (
                <>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <Th>Query</Th>
                      <Th right>Position</Th>
                      <Th right>Impressions</Th>
                      <Th right>Clicks</Th>
                      <Th right>Upside</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {striking.map((r) => (
                      <tr
                        key={r.query}
                        className="border-b border-border last:border-0"
                      >
                        <td className="max-w-[18rem] truncate px-3 py-2">
                          {text(r.query, r.query)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPosition(
                            privacy.maskNumber(r.position, `opp:${r.query}:p`, {
                              min: 8,
                              max: 20,
                              decimals: 1,
                            }),
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {n(r.impressions, `${r.query}:i`)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {n(r.clicks, `${r.query}:c`)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-success">
                          +{n(r.potentialClicks, `${r.query}:u`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {tab === "ctr" && (
                <>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <Th>Query</Th>
                      <Th right>Position</Th>
                      <Th right>Impressions</Th>
                      <Th right>CTR</Th>
                      <Th right>Expected</Th>
                      <Th right>Missed clicks</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((r) => (
                      <tr
                        key={r.query}
                        className="border-b border-border last:border-0"
                      >
                        <td className="max-w-[18rem] truncate px-3 py-2">
                          {text(r.query, r.query)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPosition(
                            privacy.maskNumber(r.position, `opp:${r.query}:p`, {
                              min: 1,
                              max: 10,
                              decimals: 1,
                            }),
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {n(r.impressions, `${r.query}:i`)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCtr(
                            privacy.maskNumber(r.ctr, `opp:${r.query}:ctr`, {
                              min: 0,
                              max: 0.05,
                              decimals: 4,
                            }),
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatCtr(r.expectedCtr)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-success">
                          +{n(r.missedClicks, `${r.query}:m`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {tab === "cannibal" && (
                <>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <Th>Query</Th>
                      <Th>Competing pages (impressions)</Th>
                      <Th right>Total impr.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cannibal.map((r) => (
                      <tr
                        key={r.query}
                        className="border-b border-border align-top last:border-0"
                      >
                        <td className="max-w-[14rem] truncate px-3 py-2">
                          {text(r.query, r.query)}
                        </td>
                        <td className="px-3 py-2">
                          <ul className="space-y-0.5">
                            {r.pages.slice(0, 4).map((p) => (
                              <li
                                key={p.page}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="truncate">
                                  {text(shortPath(p.page), p.page)}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {n(p.impressions, `${r.query}:${p.page}`)}
                                  {p.position != null &&
                                    !privacy.enabled &&
                                    ` · pos ${p.position.toFixed(1)}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {n(r.totalImpressions, `${r.query}:t`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
