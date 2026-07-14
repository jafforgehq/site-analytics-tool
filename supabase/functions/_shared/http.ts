import { SyncError, isRetryableStatus } from "./errors.ts";

export interface FetchRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Records how many retries were spent, for safe run metadata. */
  onRetry?: (attempt: number, status: number | "network") => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with a per-attempt timeout and bounded exponential backoff + jitter for
 * transient 429/5xx and network errors. Non-transient failures (e.g. 401/403)
 * are returned immediately so the caller can normalize them - they are never
 * retried in a loop. Capped so an edge function can't run indefinitely.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit = {},
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (isRetryableStatus(res.status) && attempt < maxRetries) {
        attempt += 1;
        opts.onRetry?.(attempt, res.status);
        await sleep(backoff(baseDelayMs, attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = (err as { name?: string })?.name === "AbortError";
      if (attempt < maxRetries) {
        attempt += 1;
        opts.onRetry?.(attempt, "network");
        await sleep(backoff(baseDelayMs, attempt));
        continue;
      }
      throw new SyncError(
        isAbort ? "timeout" : "network_error",
        isAbort
          ? "Upstream request timed out"
          : "Network error contacting provider",
        { retryable: true },
      );
    }
  }
}

function backoff(base: number, attempt: number): number {
  const exp = base * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * base);
  return Math.min(exp + jitter, 8_000);
}
