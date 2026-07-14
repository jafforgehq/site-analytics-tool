/**
 * One-time helper to mint a Google OAuth refresh token for the GSC + GA4
 * background syncs. Run locally:
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run oauth:google
 *
 * Prerequisites in Google Cloud Console:
 *   - Enable the Search Console API and the Google Analytics Data API.
 *   - Configure the OAuth consent screen (your Google account may need to be a
 *     test user while the app is in testing).
 *   - Create an OAuth client (type: Web application) and add the redirect URI
 *     printed below to its "Authorized redirect URIs".
 *
 * The refresh token is printed ONCE. Copy it into the Supabase Edge Function
 * secret GOOGLE_REFRESH_TOKEN. It is never written to a file.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = Number(process.env.GOOGLE_OAUTH_PORT ?? 5179);
const redirectUri =
  process.env.GOOGLE_OAUTH_REDIRECT ??
  `http://localhost:${port}/oauth2callback`;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET in the environment.",
  );
  process.exit(1);
}

const state = randomBytes(16).toString("hex");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  include_granted_scopes: "true",
  prompt: "consent",
  state,
}).toString();

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return (await res.json()) as TokenResponse;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end("Not found");
    return;
  }

  const finish = (message: string) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<html><body style="font-family:sans-serif">${message}</body></html>`,
    );
  };

  if (url.searchParams.get("state") !== state) {
    finish("State mismatch - please re-run the script.");
    console.error("\nState mismatch. Aborting for safety.");
    server.close(() => process.exit(1));
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    finish("No authorization code returned.");
    console.error("\nNo code in callback. Aborting.");
    server.close(() => process.exit(1));
    return;
  }

  const tokens = await exchangeCode(code);
  if (tokens.error || !tokens.refresh_token) {
    finish("Token exchange failed. Check the terminal.");
    console.error(
      `\nToken exchange failed: ${tokens.error ?? "no refresh_token returned"}.`,
    );
    console.error(
      "If no refresh_token was returned, revoke the app's access in your Google account and re-run (prompt=consent forces a new one).",
    );
    server.close(() => process.exit(1));
    return;
  }

  finish("Success! You can close this tab and return to the terminal.");

  console.log("\n========================================================");
  console.log("GOOGLE_REFRESH_TOKEN (copy into Supabase Edge secrets):\n");
  console.log(tokens.refresh_token);
  console.log("\n========================================================");
  console.log("WARNING:");
  console.log("  - Treat this like a password. Do NOT commit it.");
  console.log("  - Set it as the GOOGLE_REFRESH_TOKEN function secret.");
  console.log("  - Clear your terminal scrollback afterwards.");
  server.close(() => process.exit(0));
});

server.listen(port, () => {
  console.log(`\nListening on ${redirectUri}`);
  console.log("\n1. Add that exact URI to your OAuth client's redirect URIs.");
  console.log("2. Open this URL in your browser and approve access:\n");
  console.log(authUrl.toString());
  console.log("");
});
