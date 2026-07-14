import { format } from "date-fns";
import { jsPDF } from "jspdf";
import type {
  SiteMetrics,
  SiteSearchTerms,
  SiteWithStatuses,
  SyncRunRow,
} from "@/lib/api";
import { computeHealth } from "@/lib/health";
import {
  percentageChange,
  splitPeriods,
  sumAnalytics,
  sumBy,
  weightedAveragePosition,
  weightedCtr,
} from "@/lib/metrics";
import { SOURCE_LABEL, SOURCE_SHORT } from "@/lib/sources";
import { APP_COMMIT } from "@/lib/build-info";
import type { AnalyticsDaily, SearchDaily } from "@/types/database";
import type { TermRow } from "@/lib/search-terms";

export const SITE_REPORT_RANGES = [90, 180, 360] as const;
export type SiteReportDays = (typeof SITE_REPORT_RANGES)[number];

export interface SiteReportRangePayload {
  days: SiteReportDays;
  metrics: SiteMetrics;
  terms: SiteSearchTerms;
  termsError?: string;
}

export interface SitePerformanceReportInput {
  site: SiteWithStatuses;
  ranges: SiteReportRangePayload[];
  syncRuns: SyncRunRow[];
  generatedAt?: Date;
}

type Rgb = [number, number, number];

const COLORS = {
  ink: [17, 24, 39] as Rgb,
  muted: [100, 116, 139] as Rgb,
  border: [203, 213, 225] as Rgb,
  faint: [248, 250, 252] as Rgb,
  panel: [241, 245, 249] as Rgb,
  navy: [15, 23, 42] as Rgb,
  sky: [14, 165, 233] as Rgb,
  emerald: [16, 185, 129] as Rgb,
  amber: [245, 158, 11] as Rgb,
  rose: [244, 63, 94] as Rgb,
  violet: [139, 92, 246] as Rgb,
  white: [255, 255, 255] as Rgb,
};

const MARGIN = 36;
const FOOTER_SPACE = 34;

interface PdfState {
  doc: jsPDF;
  width: number;
  height: number;
  y: number;
  siteName: string;
  generatedAt: Date;
}

interface RangeSummary {
  days: number;
  analytics: ReturnType<typeof splitPeriods<AnalyticsDaily>>;
  google: ReturnType<typeof splitPeriods<SearchDaily>>;
  bing: ReturnType<typeof splitPeriods<SearchDaily>>;
  activeUsers: number;
  activeUsersPrev: number;
  sessions: number;
  sessionsPrev: number;
  pageViews: number;
  pageViewsPrev: number;
  engagedSessions: number;
  engagedSessionsPrev: number;
  engagementRate: number | null;
  engagementRatePrev: number | null;
  pagesPerSession: number | null;
  googleClicks: number;
  googleClicksPrev: number;
  googleImpressions: number;
  googleImpressionsPrev: number;
  googleCtr: number | null;
  googleCtrPrev: number | null;
  googlePosition: number | null;
  bingClicks: number;
  bingClicksPrev: number;
  bingImpressions: number;
  bingImpressionsPrev: number;
}

interface ChartSeries<T> {
  label: string;
  color: Rgb;
  value: (row: T) => number;
}

function setFill(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: Rgb) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: Rgb) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function fmtNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return Math.round(value).toLocaleString("en-US");
}

function fmtDecimal(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function fmtRatio(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function fmtDelta(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "vs prev: n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}% vs prev`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value;
}

function dateSpan(rows: Array<{ metric_date: string }>): string {
  if (rows.length === 0) return "no rows";
  const dates = [...new Set(rows.map((row) => row.metric_date))].sort();
  return `${dates[0]} to ${dates[dates.length - 1]}`;
}

function distinctDateCount(rows: Array<{ metric_date: string }>): number {
  return new Set(rows.map((row) => row.metric_date)).size;
}

function completePeriodChange(
  current: number,
  previous: number,
  previousRows: Array<{ metric_date: string }>,
  days: number,
): number | null {
  if (distinctDateCount(previousRows) < days) return null;
  return percentageChange(current, previous);
}

function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
}

function addPage(state: PdfState) {
  state.doc.addPage();
  state.y = MARGIN + 34;
  drawPageHeader(state);
}

function ensureSpace(state: PdfState, needed: number) {
  if (state.y + needed > state.height - MARGIN - FOOTER_SPACE) {
    addPage(state);
  }
}

function drawPageHeader(state: PdfState) {
  const { doc } = state;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, COLORS.muted);
  doc.text(state.siteName, MARGIN, MARGIN - 4);
  doc.setFont("helvetica", "normal");
  doc.text(
    format(state.generatedAt, "yyyy-MM-dd HH:mm"),
    state.width - MARGIN,
    MARGIN - 4,
    {
      align: "right",
    },
  );
  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, MARGIN + 7, state.width - MARGIN, MARGIN + 7);
}

function drawWrappedText(
  state: PdfState,
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  lineHeight = fontSize * 1.35,
): number {
  const lines = state.doc.splitTextToSize(text, width) as string[];
  state.doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawSectionTitle(state: PdfState, title: string, eyebrow?: string) {
  ensureSpace(state, eyebrow ? 58 : 42);
  const { doc } = state;
  if (eyebrow) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(doc, COLORS.sky);
    doc.text(eyebrow.toUpperCase(), MARGIN, state.y);
    state.y += 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  setText(doc, COLORS.ink);
  doc.text(title, MARGIN, state.y);
  state.y += 26;
}

function summarizeRange(payload: SiteReportRangePayload): RangeSummary {
  const analytics = splitPeriods(payload.metrics.analytics, payload.days);
  const google = splitPeriods(
    payload.metrics.search.filter((row) => row.engine === "google"),
    payload.days,
  );
  const bing = splitPeriods(
    payload.metrics.search.filter((row) => row.engine === "bing"),
    payload.days,
  );

  const activeUsers = sumAnalytics(analytics.current, "active_users");
  const activeUsersPrev = sumAnalytics(analytics.previous, "active_users");
  const sessions = sumAnalytics(analytics.current, "sessions");
  const sessionsPrev = sumAnalytics(analytics.previous, "sessions");
  const pageViews = sumAnalytics(analytics.current, "screen_page_views");
  const pageViewsPrev = sumAnalytics(analytics.previous, "screen_page_views");
  const engagedSessions = sumAnalytics(analytics.current, "engaged_sessions");
  const engagedSessionsPrev = sumAnalytics(
    analytics.previous,
    "engaged_sessions",
  );
  const googleClicks = sumBy(google.current, (row) => row.clicks);
  const googleClicksPrev = sumBy(google.previous, (row) => row.clicks);
  const googleImpressions = sumBy(google.current, (row) => row.impressions);
  const googleImpressionsPrev = sumBy(
    google.previous,
    (row) => row.impressions,
  );
  const bingClicks = sumBy(bing.current, (row) => row.clicks);
  const bingClicksPrev = sumBy(bing.previous, (row) => row.clicks);
  const bingImpressions = sumBy(bing.current, (row) => row.impressions);
  const bingImpressionsPrev = sumBy(bing.previous, (row) => row.impressions);

  return {
    days: payload.days,
    analytics,
    google,
    bing,
    activeUsers,
    activeUsersPrev,
    sessions,
    sessionsPrev,
    pageViews,
    pageViewsPrev,
    engagedSessions,
    engagedSessionsPrev,
    engagementRate: sessions > 0 ? engagedSessions / sessions : null,
    engagementRatePrev:
      sessionsPrev > 0 ? engagedSessionsPrev / sessionsPrev : null,
    pagesPerSession: sessions > 0 ? pageViews / sessions : null,
    googleClicks,
    googleClicksPrev,
    googleImpressions,
    googleImpressionsPrev,
    googleCtr: weightedCtr(googleClicks, googleImpressions),
    googleCtrPrev: weightedCtr(googleClicksPrev, googleImpressionsPrev),
    googlePosition: weightedAveragePosition(google.current),
    bingClicks,
    bingClicksPrev,
    bingImpressions,
    bingImpressionsPrev,
  };
}

function drawCover(state: PdfState, input: SitePerformanceReportInput) {
  const { doc } = state;
  setFill(doc, COLORS.navy);
  doc.rect(0, 0, state.width, 220, "F");
  setFill(doc, COLORS.sky);
  doc.rect(0, 205, state.width * 0.42, 15, "F");
  setFill(doc, COLORS.emerald);
  doc.rect(state.width * 0.42, 205, state.width * 0.31, 15, "F");
  setFill(doc, COLORS.amber);
  doc.rect(state.width * 0.73, 205, state.width * 0.27, 15, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, COLORS.sky);
  doc.text("SITE ANALYTICS", MARGIN, 54);

  doc.setFontSize(27);
  setText(doc, COLORS.white);
  doc.text("Site Performance", MARGIN, 92);
  doc.text("Intelligence Report", MARGIN, 124);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setText(doc, [226, 232, 240]);
  drawWrappedText(
    state,
    "A single PDF built for Claude Code or any other analysis agent. It combines GA4, Search Console, Bing, top query/page signals, sync health, and data coverage notes.",
    MARGIN,
    150,
    state.width - MARGIN * 2 - 60,
    11,
  );

  const cardY = 260;
  const cardW = state.width - MARGIN * 2;
  setFill(doc, COLORS.faint);
  setDraw(doc, COLORS.border);
  doc.roundedRect(MARGIN, cardY, cardW, 116, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  setText(doc, COLORS.ink);
  doc.text(input.site.name, MARGIN + 22, cardY + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setText(doc, COLORS.muted);
  doc.text(input.site.domain, MARGIN + 22, cardY + 55);
  doc.text(input.site.website_url, MARGIN + 22, cardY + 72);
  doc.text(
    `Generated ${format(state.generatedAt, "yyyy-MM-dd HH:mm")}`,
    MARGIN + 22,
    cardY + 92,
  );

  const ranges = input.ranges.map((range) => `${range.days}d`).join(" / ");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, COLORS.sky);
  doc.text("REPORT WINDOWS", state.width - MARGIN - 22, cardY + 35, {
    align: "right",
  });
  doc.setFontSize(20);
  setText(doc, COLORS.ink);
  doc.text(ranges, state.width - MARGIN - 22, cardY + 62, {
    align: "right",
  });

  const briefY = 420;
  drawSectionTitleAt(state, "Agent Analysis Brief", MARGIN, briefY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setText(doc, COLORS.ink);
  const prompt =
    "Use this report to evaluate whether the page is winning over the last 90 days, then compare against 180 and 360 day context where data is available. Focus on traffic quality, search demand, CTR, page 2 opportunities, query/page winners, falling segments, data freshness, and concrete next actions.";
  drawWrappedText(state, prompt, MARGIN, briefY + 30, cardW, 10);

  const chips = [
    { label: "Growth", color: COLORS.sky },
    { label: "Engagement", color: COLORS.emerald },
    { label: "Search demand", color: COLORS.amber },
    { label: "Risk", color: COLORS.rose },
  ];
  let chipX = MARGIN;
  for (const chip of chips) {
    const width = doc.getTextWidth(chip.label) + 22;
    setFill(doc, chip.color);
    doc.roundedRect(chipX, briefY + 78, width, 22, 11, 11, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(doc, COLORS.white);
    doc.text(chip.label, chipX + 11, briefY + 93);
    chipX += width + 8;
  }

  state.y = state.height - 110;
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  drawWrappedText(
    state,
    "Important: daily KPI rows are retained for 540 days. Query and page breakdown rows are retained for 210 days, so long-window term/page sections can be partial and are labeled with coverage.",
    MARGIN,
    state.y,
    cardW,
    9,
  );
}

function drawSectionTitleAt(
  state: PdfState,
  title: string,
  x: number,
  y: number,
) {
  const { doc } = state;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  setText(doc, COLORS.ink);
  doc.text(title, x, y);
  setFill(doc, COLORS.sky);
  doc.rect(x, y + 8, 46, 3, "F");
}

function drawKpiGrid(
  state: PdfState,
  items: Array<{
    label: string;
    value: string;
    delta?: string;
    color: Rgb;
    note?: string;
  }>,
) {
  const cols = 3;
  const gap = 10;
  const width = (state.width - MARGIN * 2 - gap * (cols - 1)) / cols;
  const height = 76;
  ensureSpace(state, Math.ceil(items.length / cols) * (height + gap) + 8);

  const startY = state.y;
  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = MARGIN + col * (width + gap);
    const y = startY + row * (height + gap);
    setFill(state.doc, COLORS.white);
    setDraw(state.doc, COLORS.border);
    state.doc.roundedRect(x, y, width, height, 7, 7, "FD");
    setFill(state.doc, item.color);
    state.doc.roundedRect(x, y, 7, height, 4, 4, "F");

    state.doc.setFont("helvetica", "bold");
    state.doc.setFontSize(7.5);
    setText(state.doc, COLORS.muted);
    state.doc.text(item.label.toUpperCase(), x + 16, y + 20);
    state.doc.setFontSize(17);
    setText(state.doc, COLORS.ink);
    state.doc.text(item.value, x + 16, y + 44);
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8);
    setText(state.doc, COLORS.muted);
    state.doc.text(
      fitText(state.doc, item.delta ?? item.note ?? "", width - 28),
      x + 16,
      y + 62,
    );
  });

  state.y = startY + Math.ceil(items.length / cols) * (height + gap) + 4;
}

function buildSearchChartRows(summary: RangeSummary) {
  const rows = new Map<
    string,
    { metric_date: string; googleClicks: number; bingClicks: number }
  >();
  for (const row of summary.google.current) {
    rows.set(row.metric_date, {
      metric_date: row.metric_date,
      googleClicks: row.clicks,
      bingClicks: rows.get(row.metric_date)?.bingClicks ?? 0,
    });
  }
  for (const row of summary.bing.current) {
    const existing = rows.get(row.metric_date);
    rows.set(row.metric_date, {
      metric_date: row.metric_date,
      googleClicks: existing?.googleClicks ?? 0,
      bingClicks: row.clicks,
    });
  }
  return [...rows.values()].sort((a, b) =>
    a.metric_date < b.metric_date ? -1 : a.metric_date > b.metric_date ? 1 : 0,
  );
}

function drawLineChart<T extends { metric_date: string }>(
  state: PdfState,
  title: string,
  rows: T[],
  series: ChartSeries<T>[],
) {
  const height = 142;
  ensureSpace(state, height + 16);
  const x = MARGIN;
  const y = state.y;
  const width = state.width - MARGIN * 2;
  setFill(state.doc, COLORS.faint);
  setDraw(state.doc, COLORS.border);
  state.doc.roundedRect(x, y, width, height, 8, 8, "FD");

  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  setText(state.doc, COLORS.ink);
  state.doc.text(title, x + 14, y + 22);

  if (rows.length === 0) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(9);
    setText(state.doc, COLORS.muted);
    state.doc.text("No rows available for this chart.", x + 14, y + 58);
    state.y += height + 14;
    return;
  }

  let legendX = x + width - 14;
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(8);
  for (const item of [...series].reverse()) {
    const labelWidth = state.doc.getTextWidth(item.label) + 18;
    legendX -= labelWidth;
    setFill(state.doc, item.color);
    state.doc.circle(legendX + 4, y + 18, 3, "F");
    setText(state.doc, COLORS.muted);
    state.doc.text(item.label, legendX + 11, y + 21);
  }

  const plotX = x + 38;
  const plotY = y + 42;
  const plotW = width - 58;
  const plotH = height - 68;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => series.map((item) => item.value(row))),
  );

  setDraw(state.doc, [226, 232, 240]);
  state.doc.setLineWidth(0.5);
  for (let i = 0; i <= 3; i += 1) {
    const gridY = plotY + (plotH / 3) * i;
    state.doc.line(plotX, gridY, plotX + plotW, gridY);
  }

  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(7);
  setText(state.doc, COLORS.muted);
  state.doc.text(fmtNumber(maxValue), plotX - 6, plotY + 3, { align: "right" });
  state.doc.text("0", plotX - 6, plotY + plotH + 3, { align: "right" });
  state.doc.text(rows[0].metric_date, plotX, plotY + plotH + 18);
  state.doc.text(
    rows[rows.length - 1].metric_date,
    plotX + plotW,
    plotY + plotH + 18,
    {
      align: "right",
    },
  );

  for (const item of series) {
    setDraw(state.doc, item.color);
    state.doc.setLineWidth(1.4);
    let prev: { x: number; y: number } | null = null;
    rows.forEach((row, index) => {
      const pointX =
        rows.length === 1 ? plotX : plotX + (plotW * index) / (rows.length - 1);
      const pointY = plotY + plotH - (item.value(row) / maxValue) * plotH;
      if (prev) state.doc.line(prev.x, prev.y, pointX, pointY);
      prev = { x: pointX, y: pointY };
    });
  }

  state.y += height + 14;
}

function drawCoverageNotes(
  state: PdfState,
  payload: SiteReportRangePayload,
  summary: RangeSummary,
) {
  ensureSpace(state, 92);
  const { doc } = state;
  const x = MARGIN;
  const y = state.y;
  const width = state.width - MARGIN * 2;
  setFill(doc, COLORS.panel);
  setDraw(doc, COLORS.border);
  doc.roundedRect(x, y, width, 86, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, COLORS.ink);
  doc.text("Data coverage", x + 12, y + 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  setText(doc, COLORS.muted);
  const lines = [
    `GA4 current: ${distinctDateCount(summary.analytics.current)}/${payload.days} days (${dateSpan(summary.analytics.current)}); previous: ${distinctDateCount(summary.analytics.previous)}/${payload.days} days.`,
    `Google search current: ${distinctDateCount(summary.google.current)}/${payload.days} days; Bing current: ${distinctDateCount(summary.bing.current)}/${payload.days} days.`,
    `Query rows: ${payload.terms.coverage.queries.rows} rows, ${payload.terms.coverage.queries.daysWithRows} days (${fmtDate(payload.terms.coverage.queries.firstDate)} to ${fmtDate(payload.terms.coverage.queries.lastDate)}). Page rows: ${payload.terms.coverage.pages.rows} rows, ${payload.terms.coverage.pages.daysWithRows} days.`,
  ];
  if (payload.days > 90) {
    lines.push(
      "Long-window query/page detail can be partial because query and page breakdown rows are retained for 210 days.",
    );
  }
  if (payload.termsError) {
    lines.push(`Search-term detail warning: ${payload.termsError}`);
  }
  let textY = y + 36;
  for (const line of lines) {
    textY = drawWrappedText(state, line, x + 12, textY, width - 24, 8.2, 10.5);
  }
  state.y = y + 98;
}

function drawTermTable(
  state: PdfState,
  title: string,
  rows: TermRow[],
  options: { isPage?: boolean } = {},
) {
  const rowHeight = 21;
  const maxRows = 8;
  const visibleRows = rows.slice(0, maxRows);
  const tableHeight = 31 + rowHeight * Math.max(visibleRows.length, 1);
  ensureSpace(state, tableHeight + 14);
  const x = MARGIN;
  const y = state.y;
  const width = state.width - MARGIN * 2;
  const columns = [
    { label: options.isPage ? "Page" : "Query", width: 238, align: "left" },
    { label: "Clicks", width: 55, align: "right" },
    { label: "Delta", width: 58, align: "right" },
    { label: "Impr.", width: 58, align: "right" },
    { label: "CTR", width: 52, align: "right" },
    { label: "Pos.", width: 38, align: "right" },
  ] as const;

  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  setText(state.doc, COLORS.ink);
  state.doc.text(title, x, y);

  const tableY = y + 12;
  setFill(state.doc, COLORS.white);
  setDraw(state.doc, COLORS.border);
  state.doc.roundedRect(x, tableY, width, tableHeight - 12, 7, 7, "FD");
  setFill(state.doc, COLORS.faint);
  state.doc.roundedRect(x, tableY, width, 24, 7, 7, "F");
  state.doc.rect(x, tableY + 12, width, 12, "F");
  setDraw(state.doc, COLORS.border);
  state.doc.line(x, tableY + 24, x + width, tableY + 24);

  let colX = x + 12;
  state.doc.setFontSize(7.5);
  setText(state.doc, COLORS.muted);
  for (const col of columns) {
    const textX = col.align === "right" ? colX + col.width - 4 : colX;
    state.doc.text(col.label.toUpperCase(), textX, tableY + 16, {
      align: col.align,
    });
    colX += col.width;
  }

  if (visibleRows.length === 0) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8.5);
    setText(state.doc, COLORS.muted);
    state.doc.text("No rows available.", x + 12, tableY + 44);
    state.y = y + tableHeight + 16;
    return;
  }

  visibleRows.forEach((row, index) => {
    const rowY = tableY + 24 + index * rowHeight;
    if (index > 0) {
      setDraw(state.doc, [226, 232, 240]);
      state.doc.line(x, rowY, x + width, rowY);
    }
    const values = [
      fitText(state.doc, options.isPage ? shortUrl(row.key) : row.key, 214),
      fmtNumber(row.clicks),
      fmtDelta(row.clicksPct).replace(" vs prev", ""),
      fmtNumber(row.impressions),
      fmtRatio(row.ctr),
      fmtDecimal(row.position, 1),
    ];
    colX = x + 12;
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8);
    setText(state.doc, COLORS.ink);
    columns.forEach((col, colIndex) => {
      const textX = col.align === "right" ? colX + col.width - 4 : colX;
      state.doc.text(values[colIndex], textX, rowY + 14, {
        align: col.align,
      });
      colX += col.width;
    });
  });

  state.y = y + tableHeight + 16;
}

function fitText(doc: jsPDF, value: string, maxWidth: number): string {
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let text = value;
  while (text.length > 8 && doc.getTextWidth(`${text}...`) > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}...`;
}

function drawRangeSection(state: PdfState, payload: SiteReportRangePayload) {
  const summary = summarizeRange(payload);
  drawSectionTitle(
    state,
    `Last ${payload.days} Days`,
    payload.days === 90 ? "Primary success window" : "Context window",
  );
  drawCoverageNotes(state, payload, summary);
  drawKpiGrid(state, [
    {
      label: "Active users",
      value: fmtNumber(summary.activeUsers),
      delta: fmtDelta(
        completePeriodChange(
          summary.activeUsers,
          summary.activeUsersPrev,
          summary.analytics.previous,
          payload.days,
        ),
      ),
      color: COLORS.sky,
    },
    {
      label: "Sessions",
      value: fmtNumber(summary.sessions),
      delta: fmtDelta(
        completePeriodChange(
          summary.sessions,
          summary.sessionsPrev,
          summary.analytics.previous,
          payload.days,
        ),
      ),
      color: COLORS.violet,
    },
    {
      label: "Page views",
      value: fmtNumber(summary.pageViews),
      delta: fmtDelta(
        completePeriodChange(
          summary.pageViews,
          summary.pageViewsPrev,
          summary.analytics.previous,
          payload.days,
        ),
      ),
      color: COLORS.emerald,
    },
    {
      label: "Engagement rate",
      value: fmtRatio(summary.engagementRate),
      delta: fmtDelta(
        summary.engagementRate != null &&
          summary.engagementRatePrev != null &&
          distinctDateCount(summary.analytics.previous) >= payload.days
          ? percentageChange(summary.engagementRate, summary.engagementRatePrev)
          : null,
      ),
      color: COLORS.amber,
    },
    {
      label: "Google clicks",
      value: fmtNumber(summary.googleClicks),
      delta: fmtDelta(
        completePeriodChange(
          summary.googleClicks,
          summary.googleClicksPrev,
          summary.google.previous,
          payload.days,
        ),
      ),
      color: COLORS.emerald,
    },
    {
      label: "Google CTR",
      value: fmtRatio(summary.googleCtr),
      delta: fmtDelta(
        summary.googleCtr != null &&
          summary.googleCtrPrev != null &&
          distinctDateCount(summary.google.previous) >= payload.days
          ? percentageChange(summary.googleCtr, summary.googleCtrPrev)
          : null,
      ),
      color: COLORS.rose,
    },
    {
      label: "Google impressions",
      value: fmtNumber(summary.googleImpressions),
      delta: fmtDelta(
        completePeriodChange(
          summary.googleImpressions,
          summary.googleImpressionsPrev,
          summary.google.previous,
          payload.days,
        ),
      ),
      color: COLORS.sky,
    },
    {
      label: "Avg. position",
      value: fmtDecimal(summary.googlePosition, 1),
      note: "Lower is better",
      color: COLORS.amber,
    },
    {
      label: "Bing clicks",
      value: fmtNumber(summary.bingClicks),
      delta: fmtDelta(
        completePeriodChange(
          summary.bingClicks,
          summary.bingClicksPrev,
          summary.bing.previous,
          payload.days,
        ),
      ),
      color: COLORS.violet,
    },
  ]);

  drawLineChart(
    state,
    "GA4 active users and sessions",
    summary.analytics.current,
    [
      {
        label: "Active users",
        color: COLORS.sky,
        value: (row) => row.active_users,
      },
      { label: "Sessions", color: COLORS.violet, value: (row) => row.sessions },
    ],
  );
  drawLineChart(
    state,
    "Search clicks by engine",
    buildSearchChartRows(summary),
    [
      {
        label: "Google",
        color: COLORS.emerald,
        value: (row) => row.googleClicks,
      },
      { label: "Bing", color: COLORS.amber, value: (row) => row.bingClicks },
    ],
  );
}

function drawOpportunitySection(
  state: PdfState,
  payload: SiteReportRangePayload,
) {
  drawSectionTitle(
    state,
    "Search Opportunities",
    `Top query and page detail - last ${payload.days} days`,
  );
  ensureSpace(state, 70);
  const { doc } = state;
  const x = MARGIN;
  const y = state.y;
  const width = state.width - MARGIN * 2;
  setFill(doc, COLORS.panel);
  setDraw(doc, COLORS.border);
  doc.roundedRect(x, y, width, 58, 8, 8, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(doc, COLORS.muted);
  drawWrappedText(
    state,
    `Query rows: ${payload.terms.coverage.queries.rows} rows across ${payload.terms.coverage.queries.daysWithRows} days (${fmtDate(payload.terms.coverage.queries.firstDate)} to ${fmtDate(payload.terms.coverage.queries.lastDate)}). Page rows: ${payload.terms.coverage.pages.rows} rows across ${payload.terms.coverage.pages.daysWithRows} days. These tables are shown once to avoid repeating the same retained breakdown data across long windows.`,
    x + 14,
    y + 20,
    width - 28,
    8.5,
    11,
  );
  state.y = y + 74;
  drawTermTable(state, "Top search terms", payload.terms.queries);
  drawTermTable(state, "Top pages", payload.terms.pages, { isPage: true });
}

function drawHealthSection(state: PdfState, site: SiteWithStatuses) {
  drawSectionTitle(state, "Integration Health", "Freshness and sync status");
  const now = state.generatedAt;
  const rows = site.statuses.map((status) => {
    const health = computeHealth(status, now);
    return {
      integration: SOURCE_LABEL[status.source],
      health: health.title,
      lastSuccess:
        status.last_success_at?.slice(0, 16).replace("T", " ") ?? "-",
      rows: fmtNumber(status.last_rows_written),
      reason: health.reason,
      color:
        health.level === "healthy"
          ? COLORS.emerald
          : health.level === "warning"
            ? COLORS.amber
            : health.level === "critical"
              ? COLORS.rose
              : COLORS.sky,
    };
  });

  const rowHeight = 30;
  const tableHeight = 30 + rowHeight * Math.max(rows.length, 1);
  ensureSpace(state, tableHeight + 12);
  const x = MARGIN;
  const y = state.y;
  const width = state.width - MARGIN * 2;
  setFill(state.doc, COLORS.white);
  setDraw(state.doc, COLORS.border);
  state.doc.roundedRect(x, y, width, tableHeight, 7, 7, "FD");
  setFill(state.doc, COLORS.faint);
  state.doc.roundedRect(x, y, width, 24, 7, 7, "F");
  state.doc.rect(x, y + 12, width, 12, "F");

  const headers = [
    { label: "Integration", width: 105, align: "left" },
    { label: "Health", width: 74, align: "left" },
    { label: "Last success", width: 102, align: "left" },
    { label: "Rows", width: 54, align: "right" },
    { label: "Reason", width: 158, align: "left" },
  ] as const;

  let colX = x + 12;
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(7.5);
  setText(state.doc, COLORS.muted);
  for (const [index, header] of headers.entries()) {
    const leftOffset = index === 4 ? 10 : 0;
    const textX =
      header.align === "right" ? colX + header.width - 4 : colX + leftOffset;
    state.doc.text(header.label.toUpperCase(), textX, y + 16, {
      align: header.align,
    });
    colX += header.width;
  }

  if (rows.length === 0) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8.5);
    setText(state.doc, COLORS.muted);
    state.doc.text("No integration statuses found.", x + 12, y + 45);
    state.y += tableHeight + 16;
    return;
  }

  rows.forEach((row, index) => {
    const rowY = y + 24 + index * rowHeight;
    setDraw(state.doc, [226, 232, 240]);
    state.doc.line(x, rowY, x + width, rowY);
    setFill(state.doc, row.color);
    state.doc.roundedRect(x + 12, rowY + 8, 7, 14, 3.5, 3.5, "F");
    const values = [
      row.integration,
      row.health,
      row.lastSuccess,
      row.rows,
      fitText(state.doc, row.reason, headers[4].width - 8),
    ];
    colX = x + 12;
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8);
    setText(state.doc, COLORS.ink);
    headers.forEach((header, headerIndex) => {
      const offsetX =
        headerIndex === 0 ? colX + 15 : colX + (headerIndex === 4 ? 10 : 0);
      const textX =
        header.align === "right" ? colX + header.width - 4 : offsetX;
      state.doc.text(values[headerIndex], textX, rowY + 18, {
        align: header.align,
      });
      colX += header.width;
    });
  });

  state.y += tableHeight + 16;
}

function drawSyncHistory(state: PdfState, runs: SyncRunRow[]) {
  drawSectionTitle(state, "Recent Sync Runs", "Operational evidence");
  const rowHeight = 22;
  const visibleRuns = runs.slice(0, 14);
  const tableHeight = 30 + rowHeight * Math.max(visibleRuns.length, 1);
  ensureSpace(state, tableHeight + 10);
  const x = MARGIN;
  const y = state.y;
  const width = state.width - MARGIN * 2;
  setFill(state.doc, COLORS.white);
  setDraw(state.doc, COLORS.border);
  state.doc.roundedRect(x, y, width, tableHeight, 7, 7, "FD");
  setFill(state.doc, COLORS.faint);
  state.doc.roundedRect(x, y, width, 24, 7, 7, "F");
  state.doc.rect(x, y + 12, width, 12, "F");

  const headers = [
    { label: "Started", width: 112, align: "left" },
    { label: "Source", width: 60, align: "left" },
    { label: "Trigger", width: 70, align: "left" },
    { label: "Status", width: 70, align: "left" },
    { label: "Rows", width: 62, align: "right" },
    { label: "Error", width: 116, align: "left" },
  ] as const;

  let colX = x + 12;
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(7.5);
  setText(state.doc, COLORS.muted);
  for (const [index, header] of headers.entries()) {
    const leftOffset = index === 5 ? 10 : 0;
    const textX =
      header.align === "right" ? colX + header.width - 4 : colX + leftOffset;
    state.doc.text(header.label.toUpperCase(), textX, y + 16, {
      align: header.align,
    });
    colX += header.width;
  }

  if (visibleRuns.length === 0) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8.5);
    setText(state.doc, COLORS.muted);
    state.doc.text("No sync runs found for this site.", x + 12, y + 45);
    state.y += tableHeight + 16;
    return;
  }

  visibleRuns.forEach((run, index) => {
    const rowY = y + 24 + index * rowHeight;
    setDraw(state.doc, [226, 232, 240]);
    state.doc.line(x, rowY, x + width, rowY);
    const values = [
      run.started_at.slice(0, 16).replace("T", " "),
      SOURCE_SHORT[run.source],
      run.trigger_type,
      run.status,
      fmtNumber(run.rows_written),
      run.error_code ?? "-",
    ];
    colX = x + 12;
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8);
    setText(state.doc, COLORS.ink);
    headers.forEach((header, headerIndex) => {
      const textX =
        header.align === "right"
          ? colX + header.width - 4
          : colX + (headerIndex === 5 ? 10 : 0);
      state.doc.text(
        fitText(state.doc, values[headerIndex], header.width - 8),
        textX,
        rowY + 14,
        {
          align: header.align,
        },
      );
      colX += header.width;
    });
  });

  state.y += tableHeight + 16;
}

function drawAppendix(state: PdfState) {
  drawSectionTitle(state, "Analysis Checklist", "Suggested agent pass");
  const checks = [
    "1. Decide if the last 90 days were successful using sessions, active users, page views, engagement rate, Google clicks, impressions, CTR, and position.",
    "2. Compare 90 days against 180 and 360 day context to separate durable momentum from recent volatility.",
    "3. Identify search opportunities: high impressions with low CTR, page 2 rankings, and pages gaining clicks.",
    "4. Diagnose risk: stale integrations, failed syncs, missing coverage, declining clicks, or engagement quality dropping while traffic rises.",
    "5. Produce an action plan with prioritized experiments, expected impact, owner, and the exact data point that justified each action.",
  ];
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(9);
  const x = MARGIN;
  const width = state.width - MARGIN * 2;
  const wrapped = checks.map(
    (check) => state.doc.splitTextToSize(check, width - 28) as string[],
  );
  const boxHeight =
    30 + wrapped.reduce((total, lines) => total + lines.length * 12 + 4, 0);
  ensureSpace(state, boxHeight + 18);
  const y = state.y;
  setFill(state.doc, COLORS.faint);
  setDraw(state.doc, COLORS.border);
  state.doc.roundedRect(x, y, width, boxHeight, 8, 8, "FD");
  let textY = y + 22;
  setText(state.doc, COLORS.ink);
  for (const lines of wrapped) {
    state.doc.text(lines, x + 14, textY);
    textY += lines.length * 12;
    textY += 4;
  }
  state.y = y + boxHeight + 16;
}

function addFooters(state: PdfState) {
  const pages = state.doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    state.doc.setPage(page);
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8);
    setText(state.doc, COLORS.muted);
    state.doc.text(
      `Site Analytics commit ${APP_COMMIT} - ${state.siteName}`,
      MARGIN,
      state.height - 22,
    );
    state.doc.text(
      `Page ${page} of ${pages}`,
      state.width - MARGIN,
      state.height - 22,
      {
        align: "right",
      },
    );
  }
}

export function createSitePerformanceReportPdf(
  input: SitePerformanceReportInput,
) {
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const state: PdfState = {
    doc,
    width: doc.internal.pageSize.getWidth(),
    height: doc.internal.pageSize.getHeight(),
    y: MARGIN,
    siteName: input.site.name,
    generatedAt,
  };

  drawCover(state, input);
  addPage(state);
  input.ranges.forEach((range, index) => {
    if (index > 0) addPage(state);
    drawRangeSection(state, range);
  });
  const primaryRange = input.ranges.find((range) => range.days === 90);
  if (primaryRange) {
    addPage(state);
    drawOpportunitySection(state, primaryRange);
  }
  addPage(state);
  drawHealthSection(state, input.site);
  drawSyncHistory(state, input.syncRuns);
  drawAppendix(state);
  addFooters(state);

  return doc;
}

export function saveSitePerformanceReport(input: SitePerformanceReportInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const doc = createSitePerformanceReportPdf({ ...input, generatedAt });
  const datePart = format(generatedAt, "yyyy-MM-dd");
  const namePart = sanitizeFilename(input.site.domain || input.site.name);
  doc.save(`${namePart || "site"}-performance-report-${datePart}.pdf`);
}
