import { describe, expect, it } from "vitest";
import { computeHealth } from "@/lib/health";

const NOW = new Date("2026-06-21T12:00:00Z");

// Default last_attempt_at to a real timestamp so fixtures aren't treated as
// "never attempted" unless they explicitly set it null.
function status(
  o: Omit<Parameters<typeof computeHealth>[0], "last_attempt_at"> & {
    last_attempt_at?: string | null;
  },
): Parameters<typeof computeHealth>[0] {
  return { last_attempt_at: "2026-06-20T04:00:00Z", ...o };
}

describe("computeHealth", () => {
  it("reports disabled when not enabled", () => {
    expect(
      computeHealth(
        status({
          enabled: false,
          last_status: null,
          last_success_at: null,
          consecutive_failures: 0,
          stale_after_hours: 36,
          last_error_code: null,
        }),
        NOW,
      ).level,
    ).toBe("disabled");
  });

  it("is healthy with a recent success and no failures", () => {
    const result = computeHealth(
      status({
        enabled: true,
        last_status: "success",
        last_success_at: "2026-06-21T06:00:00Z",
        consecutive_failures: 0,
        stale_after_hours: 36,
        last_error_code: null,
      }),
      NOW,
    );
    expect(result.level).toBe("healthy");
  });

  it("warns on a single consecutive failure", () => {
    expect(
      computeHealth(
        status({
          enabled: true,
          last_status: "failed",
          last_success_at: "2026-06-21T06:00:00Z",
          consecutive_failures: 1,
          stale_after_hours: 36,
          last_error_code: null,
        }),
        NOW,
      ).level,
    ).toBe("warning");
  });

  it("is critical at two or more consecutive failures", () => {
    expect(
      computeHealth(
        status({
          enabled: true,
          last_status: "failed",
          last_success_at: "2026-06-19T06:00:00Z",
          consecutive_failures: 2,
          stale_after_hours: 36,
          last_error_code: "provider_error",
        }),
        NOW,
      ).level,
    ).toBe("critical");
  });

  it("is neutral 'not synced yet' (pending) for a never-attempted integration", () => {
    const result = computeHealth(
      status({
        enabled: true,
        last_status: null,
        last_attempt_at: null,
        last_success_at: null,
        consecutive_failures: 0,
        stale_after_hours: 36,
        last_error_code: null,
      }),
      NOW,
    );
    expect(result.level).toBe("pending");
    expect(result.title).toBe("Not synced yet");
  });

  it("is critical when there has never been a success", () => {
    expect(
      computeHealth(
        status({
          enabled: true,
          last_status: "running",
          last_success_at: null,
          consecutive_failures: 0,
          stale_after_hours: 36,
          last_error_code: null,
        }),
        NOW,
      ).level,
    ).toBe("critical");
  });

  it("is critical on credential errors regardless of recency", () => {
    expect(
      computeHealth(
        status({
          enabled: true,
          last_status: "failed",
          last_success_at: "2026-06-21T06:00:00Z",
          consecutive_failures: 1,
          stale_after_hours: 36,
          last_error_code: "permission_denied",
        }),
        NOW,
      ).level,
    ).toBe("critical");
  });

  it("warns when data is stale but not critically so", () => {
    // 40h old, stale_after 36h, not beyond 2x (72h) → warning.
    expect(
      computeHealth(
        status({
          enabled: true,
          last_status: "success",
          last_success_at: "2026-06-19T20:00:00Z",
          consecutive_failures: 0,
          stale_after_hours: 36,
          last_error_code: null,
        }),
        NOW,
      ).level,
    ).toBe("warning");
  });
});
