import { describe, expect, it } from "vitest";
import {
  SyncError,
  normalizeError,
  sanitizeMessage,
} from "../../supabase/functions/_shared/errors";

describe("sanitizeMessage", () => {
  it("redacts bearer tokens", () => {
    expect(sanitizeMessage("failed: Bearer abc.def.ghi token")).not.toContain(
      "abc.def.ghi",
    );
  });

  it("redacts api keys and access tokens", () => {
    const out = sanitizeMessage("apikey=secret123 access_token: zzz999");
    expect(out).not.toContain("secret123");
    expect(out).not.toContain("zzz999");
  });

  it("redacts JWT-like blobs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9payloadsig";
    expect(sanitizeMessage(`token ${jwt}`)).not.toContain(jwt);
  });

  it("truncates long messages", () => {
    expect(sanitizeMessage("x".repeat(500)).length).toBeLessThanOrEqual(300);
  });

  it("falls back for empty input", () => {
    expect(sanitizeMessage("")).toBe("Unknown error");
  });
});

describe("normalizeError", () => {
  it("passes through a SyncError", () => {
    const n = normalizeError(
      new SyncError("rate_limited", "slow down", {
        status: 429,
        retryable: true,
      }),
    );
    expect(n.code).toBe("rate_limited");
    expect(n.retryable).toBe(true);
  });

  it("maps an HTTP 403 to permission_denied", () => {
    expect(normalizeError({ status: 403, message: "nope" }).code).toBe(
      "permission_denied",
    );
  });

  it("treats 429 and 5xx as retryable", () => {
    expect(normalizeError({ status: 429 }).retryable).toBe(true);
    expect(normalizeError({ status: 503 }).retryable).toBe(true);
    expect(normalizeError({ status: 400 }).retryable).toBe(false);
  });

  it("maps AbortError to a retryable timeout", () => {
    const n = normalizeError({ name: "AbortError" });
    expect(n.code).toBe("timeout");
    expect(n.retryable).toBe(true);
  });

  it("sanitizes the stored message", () => {
    const n = normalizeError(new Error("Bearer leaked.token.value here"));
    expect(n.message).not.toContain("leaked.token.value");
  });
});
