import {
  COMPARE_LABEL,
  isCompareModeAvailable,
  type CompareMode,
} from "@/lib/compare";
import { cn } from "@/lib/utils";

export const RANGE_PRESETS = [1, 7, 14, 30, 90, 180, 360] as const;

function rangeLabel(days: number): string {
  return days === 1 ? "Day" : `${days}d`;
}

export function RangeSelector({
  days,
  onChange,
  ranges = RANGE_PRESETS,
}: {
  days: number;
  onChange: (days: number) => void;
  ranges?: readonly number[];
}) {
  return (
    <div
      className="inline-flex rounded-md border border-border p-0.5"
      role="group"
      aria-label="Date range"
    >
      {ranges.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={days === r}
          title={r === 1 ? "Latest day with data" : `Last ${r} days`}
          onClick={() => onChange(r)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors",
            days === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {rangeLabel(r)}
        </button>
      ))}
    </div>
  );
}

const COMPARE_MODES: CompareMode[] = ["previous", "week", "year"];

/** Which earlier window the current range is compared against. */
export function CompareSelect({
  mode,
  days,
  onChange,
}: {
  mode: CompareMode;
  days: number;
  onChange: (mode: CompareMode) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      Compare to
      <select
        value={mode}
        onChange={(e) => onChange(e.target.value as CompareMode)}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        {COMPARE_MODES.filter((m) => isCompareModeAvailable(m, days)).map(
          (m) => (
            <option key={m} value={m}>
              {COMPARE_LABEL[m]}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
