import type { PostgrestError } from "@supabase/supabase-js";

// PostgREST caps a single response at `max_rows` (1000 in supabase/config.toml).
// Any query that can return more rows - multi-site metric history, per-query
// search breakdowns - must page through the result or it silently drops the
// rows past the cap. Because those queries order by metric_date ascending, that
// truncation would quietly discard the *most recent* days and skew every
// period-over-period comparison. `fetchAllPages` re-issues the query per page
// until a short page signals the end.

export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

/** Anything with a PostgREST-style `.range()` - i.e. a Supabase query builder. */
export interface Rangeable<T> {
  range(from: number, to: number): PromiseLike<PageResult<T>>;
}

/**
 * Fetch every row a query would return, transparently paging past PostgREST's
 * `max_rows` cap. `makeQuery` must return a *fresh* builder each call, because a
 * builder is consumed once awaited.
 */
export async function fetchAllPages<T>(
  makeQuery: () => Rangeable<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
