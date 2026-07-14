import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart as LineChartIcon } from "lucide-react";

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
}

export type ChartRow = { date: string } & Record<
  string,
  number | null | string
>;

/**
 * Responsive multi-series line chart with a consistent date axis. Missing days
 * are rendered as gaps (connectNulls=false) to avoid misleading interpolation.
 */
export function MetricLineChart({
  data,
  series,
  height = 240,
}: {
  data: ChartRow[];
  series: ChartSeries[];
  height?: number;
}) {
  const hasData = data.some((row) =>
    series.some((s) => typeof row[s.key] === "number"),
  );

  if (!hasData) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="No data for this period"
        description="Once a sync stores metrics for these dates, the chart will appear here."
      />
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => shortDate(d)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            minTickGap={24}
            stroke="hsl(var(--border))"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            width={48}
            stroke="hsl(var(--border))"
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <Tooltip
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(value: number, name) => [formatNumber(value), name]}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
