import { z } from "zod";

/**
 * Browser-safe environment. The app must fail fast with a useful message when
 * required configuration is missing, rather than rendering a broken dashboard.
 *
 * Only VITE_-prefixed, browser-safe values may ever appear here. Never read a
 * Supabase secret key, Google secret, refresh token, or Bing key in the client.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a valid URL"),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_PUBLISHABLE_KEY is required"),
  VITE_APP_URL: z.string().url("VITE_APP_URL must be a valid URL"),
  // Your Supabase plan's database-size limit, in megabytes, used to draw the
  // usage gauge on the System page. Free = 500, Pro = 8192. Optional.
  VITE_DB_SIZE_LIMIT_MB: z.coerce.number().positive().default(500),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid or missing frontend environment configuration.\n` +
      `Copy .env.example to .env.local and provide the required values.\n${issues}`,
  );
}

export const env = parsed.data;
