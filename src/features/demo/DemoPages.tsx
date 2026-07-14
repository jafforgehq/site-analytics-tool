import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Globe2,
  History,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MetricLineChart,
  type ChartRow,
} from "@/components/charts/MetricLineChart";
import { cn } from "@/lib/utils";
import {
  DEMO_SITES,
  demoMetrics,
  demoSearchTerms,
  getDemoSite,
} from "@/features/demo/demo-data";
import {
  DemoExportAllDataButton,
  DemoPdfExportButton,
} from "@/features/demo/DemoExportButtons";

const NAV = [
  { to: "/demo", label: "Overview", icon: BarChart3, end: true },
  { to: "/demo/sites", label: "Sites", icon: Globe2 },
  { to: "/demo/sync-history", label: "Sync history", icon: History },
  { to: "/demo/system", label: "System", icon: Database },
];

const traffic: ChartRow[] = [
  ["2026-06-13", 184, 241],
  ["2026-06-16", 212, 276],
  ["2026-06-19", 198, 254],
  ["2026-06-22", 263, 331],
  ["2026-06-25", 228, 295],
  ["2026-06-28", 287, 366],
  ["2026-07-01", 314, 402],
  ["2026-07-04", 292, 371],
  ["2026-07-07", 345, 441],
  ["2026-07-10", 381, 498],
  ["2026-07-12", 367, 476],
].map(([date, users, sessions]) => ({
  date: String(date),
  "Active users": Number(users),
  Sessions: Number(sessions),
}));

const syncRuns = [
  [
    "Jul 12, 04:20",
    "Trail Notes",
    "GSC",
    "Scheduled",
    "Success",
    "1.4s",
    "420",
  ],
  [
    "Jul 12, 04:10",
    "Pantry Journal",
    "GA4",
    "Scheduled",
    "Success",
    "0.8s",
    "31",
  ],
  [
    "Jul 12, 04:00",
    "Weekend Atlas",
    "Bing",
    "Scheduled",
    "Partial",
    "1.1s",
    "18",
  ],
  ["Jul 11, 15:42", "Studio Ledger", "GSC", "Manual", "Success", "1.5s", "447"],
  [
    "Jul 11, 04:20",
    "Weekend Atlas",
    "GA4",
    "Scheduled",
    "Success",
    "0.7s",
    "31",
  ],
] as const;

export function DemoLayout() {
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col border-b border-border bg-card md:fixed md:inset-y-0 md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-sm font-bold text-primary">
            S
          </div>
          <span className="text-sm font-semibold">Site Analytics</span>
        </div>
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Demo · synthetic data
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:pb-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-border p-3">
          <p className="px-1 text-xs text-muted-foreground">
            All downloads use synthetic demo data.
          </p>
          <a
            href="https://github.com/jafforgehq/site-analytics-tool"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center justify-center rounded-md border border-border bg-card text-sm font-medium hover:bg-muted"
          >
            Deployment guide on GitHub
          </a>
          <DemoExportAllDataButton />
        </div>
      </aside>
      <main className="flex-1 p-4 md:ml-60 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

export function DemoOverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
        <div>
          <span className="font-medium text-primary">Public product demo</span>
          <span className="text-muted-foreground">
            {" "}
            - synthetic data only; no account or real integration is involved.
          </span>
        </div>
        <a
          href="https://github.com/jafforgehq/site-analytics-tool"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          View source
        </a>
      </div>
      <PageTitle
        title="Portfolio overview"
        description="A public demo using synthetic data only."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Search clicks" value="3,842" change="+12.8%" />
        <Kpi label="Impressions" value="98,240" change="+18.4%" />
        <Kpi label="Active users" value="4,186" change="+9.2%" />
        <Kpi label="Sessions" value="5,329" change="+7.6%" />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Traffic trend</CardTitle>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardHeader>
          <CardContent>
            <MetricLineChart
              data={traffic}
              series={[
                { key: "Active users", name: "Active users", color: "#19a8e5" },
                { key: "Sessions", name: "Sessions", color: "#8b5cf6" },
              ]}
              height={250}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Action items</CardTitle>
            <span className="text-xs text-muted-foreground">3 insights</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <Insight
              tone="warning"
              title="Bing data is stale for Weekend Atlas"
              detail="No successful Bing sync in the last 36 hours."
            />
            <Insight
              tone="positive"
              title="Trail Notes search clicks are up 32%"
              detail="A healthy increase compared with the previous 30 days."
            />
            <Insight
              tone="info"
              title="Pantry Journal has growing impressions"
              detail="Search visibility rose 18% while CTR remained steady."
            />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top movers - clicks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Mover name="Trail Notes" value="+32.1%" up />
            <Mover name="Pantry Journal" value="+17.4%" up />
            <Mover name="Weekend Atlas" value="−8.6%" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Data coverage</CardTitle>
            <span className="text-xs text-muted-foreground">
              11/12 feeds current
            </span>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Coverage
              source="Google Search Console"
              detail="All portfolio feeds current"
            />
            <Coverage
              source="Google Analytics 4"
              detail="All portfolio feeds current"
            />
            <Coverage
              source="Bing Webmaster Tools"
              detail="Weekend Atlas needs a sync"
              warning
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>What you can try</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <DemoTry
            icon={Globe2}
            title="Explore a site"
            detail="Open any demo site to inspect traffic, search terms, and integration health."
          />
          <DemoTry
            icon={FileText}
            title="Export a PDF"
            detail="Download a realistic site report generated entirely from synthetic metrics."
          />
          <DemoTry
            icon={Download}
            title="Export data"
            detail="Download the demo portfolio as a JSON bundle or a CSV ZIP."
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function DemoSitesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Sites"
        description="Example managed websites and integration health."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {DEMO_SITES.map((site) => (
          <Link
            key={site.domain}
            to={`/demo/sites/${site.slug}`}
            className="block"
          >
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="space-y-4 p-5">
                <div>
                  <p className="font-semibold">{site.name}</p>
                  <p className="text-sm text-muted-foreground">{site.domain}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Health source="GSC" state="Healthy" />
                  <Health source="GA4" state="Healthy" />
                  <Health
                    source="Bing"
                    state={site.attention ? "Attention" : "Healthy"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Open demo site details and exports
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DemoSiteDetailPage() {
  const { siteSlug } = useParams();
  const site = getDemoSite(siteSlug);
  if (!site) {
    return (
      <div className="space-y-3">
        <PageTitle
          title="Demo site not found"
          description="Choose a site from the synthetic demo portfolio."
        />
        <Link to="/demo/sites" className="text-sm text-primary hover:underline">
          Back to demo sites
        </Link>
      </div>
    );
  }

  const metrics = demoMetrics(site, 60);
  const chart: ChartRow[] = metrics.analytics.map((row) => ({
    date: row.metric_date,
    "Active users": row.active_users,
    Sessions: row.sessions,
  }));
  const terms = demoSearchTerms(site, 30);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/demo/sites"
            className="text-sm text-primary hover:underline"
          >
            ← All demo sites
          </Link>
          <h1 className="mt-2 text-xl font-semibold">{site.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {site.description}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DemoPdfExportButton site={site} />
          <span className="text-xs text-muted-foreground">
            Generated from synthetic demo data
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sessions" value={site.sessions} change={site.change} />
        <Kpi label="Google clicks" value={site.clicks} change="+14.2%" />
        <Kpi label="Engagement rate" value="67.8%" change="+3.1%" />
        <Kpi label="Average position" value="18.6" change="−1.4%" />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Traffic trend</CardTitle>
            <p className="text-xs text-muted-foreground">
              Last 60 days · synthetic demo data
            </p>
          </CardHeader>
          <CardContent>
            <MetricLineChart
              data={chart}
              series={[
                { key: "Active users", name: "Active users", color: "#19a8e5" },
                { key: "Sessions", name: "Sessions", color: "#8b5cf6" },
              ]}
              height={250}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Integration health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Health source="Google Search Console" state="Healthy" />
            <Health source="Google Analytics 4" state="Healthy" />
            <Health
              source="Bing Webmaster Tools"
              state={site.attention ? "Attention" : "Healthy"}
            />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top queries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {terms.queries.map((term) => (
              <div
                key={term.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{term.key}</span>
                <span className="shrink-0 text-muted-foreground">
                  {term.clicks} clicks
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top pages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {terms.pages.map((term) => (
              <div
                key={term.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  {term.key.replace(`https://${site.domain}`, "")}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {term.clicks} clicks
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function DemoSyncHistoryPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Sync history"
        description="Every example sync attempt across the synthetic portfolio."
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Website</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3 text-right">Rows</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.map(
                ([started, site, source, trigger, status, duration, rows]) => (
                  <tr
                    key={`${started}-${site}-${source}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {started}
                    </td>
                    <td className="px-4 py-3 font-medium">{site}</td>
                    <td className="px-4 py-3">{source}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {trigger}
                    </td>
                    <td className="px-4 py-3">
                      <Status status={status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {duration}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rows}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function DemoSystemPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="System"
        description="Example database usage and retention controls."
      />
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">Database usage</p>
              <p className="mt-2 text-2xl font-semibold">
                42.8 MB{" "}
                <span className="text-base font-normal text-muted-foreground">
                  of 500 MB
                </span>
              </p>
            </div>
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-sm font-medium text-success">
              9%
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[9%] rounded-full bg-success" />
          </div>
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <Usage name="search_query_daily" value="12.6 MB" />
            <Usage name="search_page_daily" value="9.8 MB" />
            <Usage name="analytics_daily" value="7.2 MB" />
            <Usage name="sync_runs" value="4.1 MB" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <Retention label="Daily metrics" value="540 days" />
          <Retention label="Query & page detail" value="210 days" />
          <Retention label="Sync history" value="120 days" />
        </CardContent>
      </Card>
    </div>
  );
}

function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
function Kpi({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-success">
          <TrendingUp className="h-3 w-3" />
          {change} vs prev.
        </p>
      </CardContent>
    </Card>
  );
}
function DemoTry({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Globe2;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
function Insight({
  tone,
  title,
  detail,
}: {
  tone: "warning" | "positive" | "info";
  title: string;
  detail: string;
}) {
  const color =
    tone === "warning"
      ? "text-warning"
      : tone === "positive"
        ? "text-success"
        : "text-primary";
  return (
    <div className="flex gap-3">
      <Sparkles className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
function Mover({
  name,
  value,
  up = false,
}: {
  name: string;
  value: string;
  up?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{name}</span>
      <span
        className={cn(
          "flex items-center gap-1 font-medium",
          up ? "text-success" : "text-critical",
        )}
      >
        {up ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5" />
        )}
        {value}
      </span>
    </div>
  );
}
function Coverage({
  source,
  detail,
  warning = false,
}: {
  source: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2
        className={cn(
          "mt-0.5 h-4 w-4",
          warning ? "text-warning" : "text-success",
        )}
      />
      <div>
        <p className="font-medium">{source}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
function Health({ source, state }: { source: string; state: string }) {
  const attention = state === "Attention";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium",
        attention
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-success/30 bg-success/10 text-success",
      )}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {source} · {state}
    </span>
  );
}
function Status({ status }: { status: string }) {
  const partial = status === "Partial";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 text-xs font-medium",
        partial
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-success/30 bg-success/10 text-success",
      )}
    >
      {status}
    </span>
  );
}
function Usage({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between rounded-md bg-muted px-3 py-2">
      <code className="text-xs">{name}</code>
      <span className="font-medium">{value}</span>
    </div>
  );
}
function Retention({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
