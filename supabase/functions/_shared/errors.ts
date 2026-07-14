// Pure error helpers - NO Deno or npm imports so this module is unit-testable
// from the frontend's Vitest runner as well as the Deno edge runtime.

export type ErrorCode =
  | "auth_error"
  | "invalid_credentials"
  | "permission_denied"
  | "config_missing"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "network_error"
  | "validation_error"
  | "conflict"
  | "not_implemented"
  | "internal_error";

export class SyncError extends Error {
  code: ErrorCode;
  status?: number;
  retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

const REDACTIONS: RegExp[] = [
  /bearer\s+[a-z0-9._-]+/gi,
  /(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[=:]\s*[^\s&"']+/gi,
  /eyJ[a-zA-Z0-9._-]{10,}/g, // JWT-like blobs
  /authorization\s*:\s*[^\n]+/gi,
];

/**
 * Strip anything credential-like, collapse whitespace, and cap the length so a
 * provider's HTML error page or token never lands in the database.
 */
export function sanitizeMessage(input: unknown, maxLen = 300): string {
  let text = typeof input === "string" ? input : String(input ?? "");
  for (const re of REDACTIONS) text = text.replace(re, "[redacted]");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text || "Unknown error";
}

export interface NormalizedError {
  code: ErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
}

/** Map any thrown value into a safe, normalized shape for storage/response. */
export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof SyncError) {
    return {
      code: err.code,
      message: sanitizeMessage(err.message),
      status: err.status,
      retryable: err.retryable,
    };
  }

  // Fetch/abort style errors
  const name = (err as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return { code: "timeout", message: "Request timed out", retryable: true };
  }

  const status = (err as { status?: number })?.status;
  if (typeof status === "number") {
    return {
      code: codeForStatus(status),
      message: sanitizeMessage(err),
      status,
      retryable: isRetryableStatus(status),
    };
  }

  const message = sanitizeMessage(
    (err as { message?: string })?.message ?? err,
  );
  return { code: "internal_error", message, retryable: false };
}

export function codeForStatus(status: number): ErrorCode {
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "permission_denied";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  if (status >= 400) return "provider_error";
  return "internal_error";
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
