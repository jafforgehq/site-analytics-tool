const DASH = "-";

/** Compact-ish integer formatting, e.g. 12,345. Null/undefined → em dash. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return DASH;
  return value.toLocaleString("en-US");
}

/** A 0–1 ratio rendered as a percentage, e.g. 0.0531 → "5.31%". */
export function formatCtr(value: number | null | undefined): string {
  if (value == null) return DASH;
  return `${(value * 100).toFixed(2)}%`;
}

/** Average position to one decimal; null → em dash (not zero). */
export function formatPosition(value: number | null | undefined): string {
  if (value == null) return DASH;
  return value.toFixed(1);
}

/** Signed percentage change, e.g. +12.4% / -3.0%. Null → em dash. */
export function formatPercentChange(value: number | null | undefined): string {
  if (value == null) return DASH;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** Human byte size, e.g. 0 → "0 B", 1536 → "1.5 KB", 5e8 → "476.8 MB". */
export function formatBytes(value: number | null | undefined): string {
  if (value == null) return DASH;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

/** Human duration from milliseconds, e.g. 820 → "820ms", 2400 → "2.4s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return DASH;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export type ChangeDirection = "up" | "down" | "flat" | "none";

export function changeDirection(
  value: number | null | undefined,
): ChangeDirection {
  if (value == null) return "none";
  if (value > 0.05) return "up";
  if (value < -0.05) return "down";
  return "flat";
}
