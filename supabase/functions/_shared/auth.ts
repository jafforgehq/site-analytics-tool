import { SyncError } from "./errors.ts";
import {
  createAdminClient,
  createUserClient,
  type SupabaseClient,
} from "./database.ts";

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/** Read the `aal` claim straight from the access token payload (already
 * validated by getUser below). */
function decodeAal(token: string): string | null {
  try {
    const part = token.split(".")[1];
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as { aal?: string };
    return payload.aal ?? null;
  } catch {
    return null;
  }
}

export interface AdminContext {
  userId: string;
  admin: SupabaseClient;
}

/**
 * The browser trust path for manual-sync: a valid session, an aal2 (MFA) token,
 * and membership in the admin allowlist. All three are checked before any
 * privileged work happens.
 */
export async function requireAdminMfa(req: Request): Promise<AdminContext> {
  const token = getBearerToken(req);
  if (!token) {
    throw new SyncError("auth_error", "Missing Authorization header", {
      status: 401,
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new SyncError("auth_error", "Invalid or expired session", {
      status: 401,
    });
  }

  if (decodeAal(token) !== "aal2") {
    throw new SyncError(
      "permission_denied",
      "MFA verification (aal2) required",
      {
        status: 403,
      },
    );
  }

  // Confirm admin via the security-definer function, evaluated as the user.
  const userClient = createUserClient(token);
  const { data: isAdmin, error: rpcError } =
    await userClient.rpc("is_portfolio_admin");
  if (rpcError || !isAdmin) {
    throw new SyncError("permission_denied", "Not an authorized admin", {
      status: 403,
    });
  }

  return { userId: data.user.id, admin };
}

/** Constant-time string comparison to avoid leaking the secret via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * The automation trust path for scheduled functions: a dedicated secret in a
 * header (never the query string).
 */
export function requireAutomationSecret(req: Request): void {
  const expected = Deno.env.get("AUTOMATION_SECRET") ?? "";
  const provided = req.headers.get("X-Automation-Secret") ?? "";
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    throw new SyncError("auth_error", "Invalid automation secret", {
      status: 401,
    });
  }
}
