import { useState } from "react";
import { useManualSync } from "@/lib/hooks";
import {
  ManualSyncError,
  type ManualSource,
  type ManualSyncOutcome,
  type SiteWithStatuses,
} from "@/lib/api";
import { SOURCES, SOURCE_SHORT } from "@/lib/sources";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Feedback = { tone: "success" | "error" | "info"; text: string };

export function ManualSyncButtons({ site }: { site: SiteWithStatuses }) {
  const mutation = useManualSync(site.id);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const enabledFor = (source: string) =>
    !!site.statuses.find((s) => s.source === source)?.enabled;
  const anyEnabled = SOURCES.some(enabledFor);
  const pending = mutation.isPending ? mutation.variables : null;

  const run = (source: ManualSource) => {
    setFeedback(null);
    mutation.mutate(source, {
      onSuccess: (runs: ManualSyncOutcome[]) => setFeedback(summarize(runs)),
      onError: (err) => setFeedback(toFeedback(err)),
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Manual sync</h2>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((source) => (
          <Button
            key={source}
            variant="secondary"
            size="sm"
            disabled={!enabledFor(source) || mutation.isPending}
            loading={pending === source}
            onClick={() => run(source)}
          >
            Run {SOURCE_SHORT[source]}
          </Button>
        ))}
        <Button
          size="sm"
          disabled={!anyEnabled || mutation.isPending}
          loading={pending === "all"}
          onClick={() => run("all")}
        >
          Run all enabled
        </Button>
      </div>
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}
    </section>
  );
}

function summarize(runs: ManualSyncOutcome[]): Feedback {
  const ok = runs.filter(
    (r) => r.status === "success" || r.status === "partial",
  );
  const failed = runs.filter((r) => r.status === "failed");
  const conflict = runs.filter((r) => r.status === "conflict");

  if (failed.length && !ok.length) {
    return {
      tone: "error",
      text: "Sync failed. Open Sync history for the sanitized error detail.",
    };
  }
  if (failed.length || conflict.length) {
    return {
      tone: "info",
      text: `Completed with issues: ${ok.length} ok, ${failed.length} failed${
        conflict.length ? `, ${conflict.length} already running` : ""
      }.`,
    };
  }
  const written = ok.reduce((t, r) => t + (r.rowsWritten ?? 0), 0);
  return {
    tone: "success",
    text: `Sync complete - ${written} rows written.`,
  };
}

function toFeedback(err: unknown): Feedback {
  if (err instanceof ManualSyncError) {
    if (err.status === 409 || err.code === "already_running") {
      return {
        tone: "info",
        text: "A sync is already running for this integration.",
      };
    }
    if (err.status === 401 || err.status === 403) {
      return {
        tone: "error",
        text: "Not authorized - an MFA-verified admin session is required.",
      };
    }
  }
  return { tone: "error", text: "Could not start the sync. Please try again." };
}
