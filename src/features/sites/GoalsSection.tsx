import { useMemo, useState, type FormEvent } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { useCreateGoal, useDeleteGoal, useSiteGoals } from "@/lib/hooks";
import { projectGoal, type GoalStatus } from "@/lib/forecast";
import { clicksSeries, sessionsSeries } from "@/lib/series";
import { formatNumber } from "@/lib/format";
import { usePrivacyMode } from "@/lib/privacy";
import type {
  AnalyticsDaily,
  GoalMetric,
  SearchDaily,
  SiteGoal,
} from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<GoalStatus, { label: string; tone: string }> = {
  achieved: {
    label: "Achieved",
    tone: "border-success/30 bg-success/10 text-success",
  },
  on_track: {
    label: "On track",
    tone: "border-success/30 bg-success/10 text-success",
  },
  at_risk: {
    label: "At risk",
    tone: "border-warning/30 bg-warning/10 text-warning",
  },
  off_track: {
    label: "Off track",
    tone: "border-critical/30 bg-critical/10 text-critical",
  },
};

const METRIC_LABEL: Record<GoalMetric, string> = {
  sessions: "sessions",
  clicks: "Google clicks",
};

export function GoalsSection({
  siteId,
  analytics,
  search,
}: {
  siteId: string;
  analytics: AnalyticsDaily[];
  search: SearchDaily[];
}) {
  const privacy = usePrivacyMode();
  const goalsQuery = useSiteGoals(siteId);
  const deleteGoal = useDeleteGoal(siteId);
  const [adding, setAdding] = useState(false);

  const series = useMemo(
    () => ({
      sessions: sessionsSeries(analytics),
      clicks: clicksSeries(search),
    }),
    [analytics, search],
  );
  const today = format(new Date(), "yyyy-MM-dd");

  const goals = goalsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Goals</h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={privacy.enabled}
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add goal
        </Button>
      </div>

      {adding && <GoalForm siteId={siteId} onDone={() => setAdding(false)} />}

      {goals.length === 0 && !adding ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Target className="h-4 w-4" aria-hidden />
            No goals yet. A goal tracks a trailing 30-day total (e.g. "10,000
            Google clicks a month by December") and is scored against the
            forecast.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              series={series[goal.metric]}
              today={today}
              onDelete={() => deleteGoal.mutate(goal.id)}
              deleting={deleteGoal.isPending}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GoalCard({
  goal,
  series,
  today,
  onDelete,
  deleting,
}: {
  goal: SiteGoal;
  series: { date: string; value: number }[];
  today: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const privacy = usePrivacyMode();
  const projection = useMemo(
    () => projectGoal(series, goal.target_value, goal.target_date, today),
    [series, goal.target_value, goal.target_date, today],
  );
  const style = STATUS_STYLE[projection.status];
  const progressPct = Math.min(
    100,
    (projection.currentValue / goal.target_value) * 100,
  );

  const mask = (value: number | null) =>
    value == null
      ? null
      : privacy.maskNumber(value, `goal:${goal.id}:${value}`);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {formatNumber(mask(goal.target_value))}{" "}
              {METRIC_LABEL[goal.metric]} / 30d
            </p>
            <p className="text-xs text-muted-foreground">
              by {privacy.enabled ? "********" : goal.target_date}
              {goal.note ? ` · ${privacy.maskText(goal.note)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                style.tone,
              )}
            >
              {style.label}
            </span>
            <button
              type="button"
              aria-label="Delete goal"
              className="text-muted-foreground transition-colors hover:text-critical"
              disabled={deleting}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                projection.status === "off_track"
                  ? "bg-critical"
                  : projection.status === "at_risk"
                    ? "bg-warning"
                    : "bg-success",
              )}
              style={{ width: `${Math.max(2, progressPct)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>
              now {formatNumber(mask(Math.round(projection.currentValue)))}
            </span>
            <span>
              {projection.projectedValue != null
                ? `projected ${formatNumber(
                    mask(Math.round(projection.projectedValue)),
                  )}`
                : "projection needs more history"}
              {" · "}
              {projection.daysRemaining}d left
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalForm({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const createGoal = useCreateGoal(siteId);
  const [metric, setMetric] = useState<GoalMetric>("clicks");
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState(
    format(addDays(new Date(), 90), "yyyy-MM-dd"),
  );
  const [note, setNote] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(targetValue);
    if (!Number.isInteger(value) || value <= 0) return;
    createGoal.mutate(
      {
        siteId,
        metric,
        targetValue: value,
        targetDate,
        note: note.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="goal-metric">Metric</Label>
            <select
              id="goal-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as GoalMetric)}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="clicks">Google clicks</option>
              <option value="sessions">Sessions</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-target">Target / 30 days</Label>
            <Input
              id="goal-target"
              type="number"
              min={1}
              required
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="10000"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-date">By date</Label>
            <Input
              id="goal-date"
              type="date"
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-note">Note (optional)</Label>
            <Input
              id="goal-note"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Q4 push"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" disabled={createGoal.isPending}>
              Save goal
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
        {createGoal.isError && (
          <Alert tone="error" className="mt-3">
            {(createGoal.error as Error).message}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
