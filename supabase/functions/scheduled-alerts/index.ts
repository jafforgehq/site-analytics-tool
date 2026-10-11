// scheduled-alerts: daily detection of traffic drops, downtime, failing syncs
// and indexing problems. New alerts are stored (deduped by dedupe_key) and, if
// Resend is configured, emailed once as a single digest. Auth: the automation
// secret. Email failure never fails the run; secrets are never logged/returned.

import { requireAutomationSecret } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/database.ts";
import { normalizeError } from "../_shared/errors.ts";
import { json } from "../_shared/response.ts";
import { utcDateMinus } from "../_shared/range.ts";
import {
  buildDigest,
  detectAlerts,
  type AlertCandidate,
  type SiteSignals,
} from "../_shared/alerts.ts";

const MAX_SITES_PER_RUN = 100;
const DEFAULT_FROM = "Site Analytics <onboarding@resend.dev>";

interface SiteRow {
  id: string;
  name: string;
}

async function sendDigest(alerts: AlertCandidate[]): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ALERT_EMAIL_TO");
  if (!apiKey || !to || alerts.length === 0) return false;
  const { subject, html } = buildDigest(alerts);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("ALERT_EMAIL_FROM") || DEFAULT_FROM,
        to: to.split(",").map((s) => s.trim()),
        subject,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    requireAutomationSecret(req);
  } catch (err) {
    const n = normalizeError(err);
    return json(n.status ?? 401, { ok: false, error: n.code });
  }

  try {
    const admin = createAdminClient();
    const { data: sites, error } = await admin
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name")
      .limit(MAX_SITES_PER_RUN);
    if (error) throw error;

    const now = new Date();
    const candidates: AlertCandidate[] = [];
    for (const site of (sites ?? []) as SiteRow[]) {
      const [daily, uptime, integrations, inspections] = await Promise.all([
        admin
          .from("search_daily")
          .select("metric_date,clicks")
          .eq("site_id", site.id)
          .eq("engine", "google")
          .gte("metric_date", utcDateMinus(14, now)),
        admin
          .from("uptime_checks")
          .select("checked_at,ok")
          .eq("site_id", site.id)
          .order("checked_at", { ascending: false })
          .limit(2),
        admin
          .from("integration_status")
          .select("source,enabled,consecutive_failures")
          .eq("site_id", site.id),
        admin
          .from("url_inspections")
          .select("verdict,coverage_state")
          .eq("site_id", site.id)
          .limit(1000),
      ]);
      for (const r of [daily, uptime, integrations, inspections]) {
        if (r.error) throw r.error;
      }
      const signals: SiteSignals = {
        site,
        googleClicks: daily.data ?? [],
        uptime: uptime.data ?? [],
        integrations: integrations.data ?? [],
        inspections: inspections.data ?? [],
      };
      candidates.push(...detectAlerts(signals, now));
    }

    let created: AlertCandidate[] = [];
    let createdIds: string[] = [];
    if (candidates.length > 0) {
      // ignoreDuplicates = ON CONFLICT DO NOTHING: only new rows are returned.
      const { data, error: insertError } = await admin
        .from("alerts")
        .upsert(candidates, {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        })
        .select("id,dedupe_key");
      if (insertError) throw insertError;
      const fresh = new Set((data ?? []).map((r) => r.dedupe_key as string));
      created = candidates.filter((c) => fresh.has(c.dedupe_key));
      createdIds = (data ?? []).map((r) => r.id as string);
    }

    let emailed = false;
    if (created.length > 0 && (await sendDigest(created))) {
      emailed = true;
      await admin
        .from("alerts")
        .update({ emailed_at: new Date().toISOString() })
        .in("id", createdIds);
    }

    return json(200, {
      ok: true,
      detected: candidates.length,
      created: created.length,
      emailed,
    });
  } catch (err) {
    return json(500, { ok: false, error: normalizeError(err).code });
  }
});
