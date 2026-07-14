import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { fetchAllPages, PAGE_SIZE, type Rangeable } from "@/lib/paginate";

/**
 * A fake Supabase query builder over a fixed dataset. Each `makeQuery()` call
 * returns a fresh object whose `.range(from, to)` resolves to the matching
 * slice - exactly how PostgREST's bounded range requests behave.
 */
function fakeTable<T>(rows: T[], spy?: (from: number, to: number) => void) {
  return (): Rangeable<T> => ({
    range(from: number, to: number) {
      spy?.(from, to);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
}

describe("fetchAllPages", () => {
  it("returns everything in one shot when under a page", async () => {
    const rows = Array.from({ length: 42 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const result = await fetchAllPages(
      fakeTable(rows, (a, b) => calls.push([a, b])),
    );
    expect(result).toEqual(rows);
    expect(calls).toEqual([[0, PAGE_SIZE - 1]]);
  });

  it("stitches multiple pages past the 1000-row cap", async () => {
    // 2300 rows would be truncated to 1000 by a single request.
    const rows = Array.from({ length: 2300 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const result = await fetchAllPages(
      fakeTable(rows, (a, b) => calls.push([a, b])),
    );
    expect(result).toHaveLength(2300);
    expect(result).toEqual(rows);
    // Three requests: rows 0–999, 1000–1999, 2000–2299 (short page → stop).
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after a final exactly-full page with one extra empty fetch", async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const result = await fetchAllPages(
      fakeTable(rows, (a, b) => calls.push([a, b])),
    );
    expect(result).toHaveLength(PAGE_SIZE);
    // A full first page can't be distinguished from "more to come", so it probes
    // once more and gets an empty page that ends the loop.
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("treats null data as an empty page", async () => {
    const result = await fetchAllPages<number>(() => ({
      range: () => Promise.resolve({ data: null, error: null }),
    }));
    expect(result).toEqual([]);
  });

  it("throws when the query errors", async () => {
    const error = {
      name: "PostgrestError",
      message: "boom",
      details: "",
      hint: "",
      code: "500",
      toJSON() {
        return this;
      },
    } as PostgrestError;
    const makeQuery = vi.fn(
      (): Rangeable<number> => ({
        range: () => Promise.resolve({ data: null, error }),
      }),
    );
    await expect(fetchAllPages(makeQuery)).rejects.toBe(error);
    expect(makeQuery).toHaveBeenCalledTimes(1);
  });
});
