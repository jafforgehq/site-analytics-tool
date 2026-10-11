import { journeyStatusLabel, type JourneyProgress } from "@/lib/journey";
import { cn } from "@/lib/utils";

export function JourneyBar({ progress }: { progress: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          progress >= 1 ? "bg-success" : "bg-primary",
        )}
        style={{ width: `${Math.max(2, progress * 100)}%` }}
      />
    </div>
  );
}

export function JourneyStatusText({ progress }: { progress: JourneyProgress }) {
  return (
    <>
      {journeyStatusLabel(progress)}
      {progress.status !== "reached" &&
        ` · ${progress.remaining.toLocaleString("en-US")} to go`}
    </>
  );
}
