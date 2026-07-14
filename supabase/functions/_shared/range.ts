// Pure UTC date helpers - no Deno/npm imports, unit-testable from Vitest.

/** YYYY-MM-DD for (ref - days), in UTC. */
export function utcDateMinus(days: number, ref: Date = new Date()): string {
  const d = new Date(ref.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Rolling window ending yesterday (UTC). Re-fetching a recent window lets
 * providers' late-finalized values overwrite earlier ones without duplicates.
 */
export function defaultRange(
  daysBack: number,
  ref: Date = new Date(),
): { startDate: string; endDate: string } {
  return {
    startDate: utcDateMinus(daysBack, ref),
    endDate: utcDateMinus(1, ref),
  };
}
