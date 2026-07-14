import { formatDistanceStrict } from "date-fns";
import type { IntegrationStatus } from "@/types/database";

export type HealthLevel =
  | "healthy"
  | "warning"
  | "critical"
  | "pending"
  | "disabled";

export interface IntegrationHealth {
  level: HealthLevel;
  title: string;
  reason: string;
}

/**
 * Normalized error codes that always indicate a critical, human-actionable
 * problem (revoked/invalid credentials, permission denied, missing config).
 * The sync framework (Phase 5+) emits these; kept here so health logic is the
 * single source of truth.
 */
const CRITICAL_ERROR_CODES = new Set([
  "auth_error",
  "invalid_credentials",
  "invalid_grant",
  "unauthorized",
  "permission_denied",
  "config_missing",
]);

const HEALTHY: Pick<IntegrationHealth, "level" | "title"> = {
  level: "healthy",
  title: "Healthy",
};

function ago(date: Date, now: Date): string {
  return formatDistanceStrict(date, now, { addSuffix: true });
}

/**
 * Shared integration health calculation (brief §12). Used everywhere in the UI
 * so the badge on the overview matches the card on the site detail page.
 */
export function computeHealth(
  status: Pick<
    IntegrationStatus,
    | "enabled"
    | "last_status"
    | "last_attempt_at"
    | "last_success_at"
    | "consecutive_failures"
    | "stale_after_hours"
    | "last_error_code"
  >,
  now: Date = new Date(),
): IntegrationHealth {
  if (!status.enabled) {
    return {
      level: "disabled",
      title: "Disabled",
      reason: "Integration is not configured.",
    };
  }

  // A freshly-added integration that has never even been attempted isn't
  // failing - it just needs its first sync. Show a neutral "pending" state
  // (not amber warning, and not counted as needing attention).
  if (
    !status.last_attempt_at &&
    !status.last_success_at &&
    status.consecutive_failures === 0
  ) {
    return {
      level: "pending",
      title: "Not synced yet",
      reason: "Run a sync to pull the first data.",
    };
  }

  const lastSuccess = status.last_success_at
    ? new Date(status.last_success_at)
    : null;
  const ageHours = lastSuccess
    ? (now.getTime() - lastSuccess.getTime()) / 3_600_000
    : Infinity;
  const stale = status.stale_after_hours;
  const fails = status.consecutive_failures;

  // ---- Critical -----------------------------------------------------------
  if (
    status.last_error_code &&
    CRITICAL_ERROR_CODES.has(status.last_error_code)
  ) {
    return {
      level: "critical",
      title: "Critical",
      reason: "Credentials or permissions need attention.",
    };
  }
  if (fails >= 2) {
    return {
      level: "critical",
      title: "Critical",
      reason: `${fails} consecutive failures.`,
    };
  }
  if (!lastSuccess) {
    return {
      level: "critical",
      title: "Critical",
      reason: "No successful sync yet.",
    };
  }
  if (ageHours > stale * 2) {
    return {
      level: "critical",
      title: "Critical",
      reason: `Last success was ${ago(lastSuccess, now)} - well past the ${stale}h freshness window.`,
    };
  }

  // ---- Warning ------------------------------------------------------------
  if (fails === 1) {
    return {
      level: "warning",
      title: "Warning",
      reason: `One recent failure; last success was ${ago(lastSuccess, now)}.`,
    };
  }
  if (status.last_status === "partial") {
    return {
      level: "warning",
      title: "Warning",
      reason: "Latest sync only partially completed.",
    };
  }
  if (ageHours > stale) {
    return {
      level: "warning",
      title: "Warning",
      reason: `Data is older than the ${stale}h freshness window.`,
    };
  }
  if (status.last_status === "failed") {
    return {
      level: "warning",
      title: "Warning",
      reason: `Latest attempt failed; last success was ${ago(lastSuccess, now)}.`,
    };
  }

  // ---- Healthy ------------------------------------------------------------
  return {
    ...HEALTHY,
    reason: `Last success ${ago(lastSuccess, now)}.`,
  };
}
