import { Gauge } from "lucide-react";
import { useWebVitals } from "@/lib/hooks";
import { relativeTime } from "@/lib/dates";
import { usePrivacyMode } from "@/lib/privacy";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "good" | "ok" | "poor";

// Google's published Core Web Vitals thresholds (good / needs improvement).
function toneFor(value: number | null, good: number, ok: number): Tone | null {
  if (value == null) return null;
  return value <= good ? "good" : value <= ok ? "ok" : "poor";
}

const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  ok: "text-warning",
  poor: "text-critical",
};

function Vital({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone | null;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone ? TONE_CLASS[tone] : "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Latest mobile Core Web Vitals / PageSpeed result from the weekly check. */
export function VitalsCard({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  const vitals = useWebVitals(siteId);
  const mobile = (vitals.data ?? []).filter((v) => v.strategy === "mobile");
  const latest = mobile.at(-1);
  if (!latest) return null;

  const lcp = latest.lcp_ms == null ? null : Number(latest.lcp_ms);
  const inp = latest.inp_ms == null ? null : Number(latest.inp_ms);
  const cls = latest.cls == null ? null : Number(latest.cls);
  const score =
    latest.performance_score == null
      ? null
      : Math.round(Number(latest.performance_score) * 100);

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Gauge className="h-4 w-4" aria-hidden />
            Core Web Vitals · mobile
          </span>
          <span className="text-[11px] text-muted-foreground">
            {latest.field_data ? "real users" : "lab test"}
          </span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {privacy.enabled ? "**" : (score ?? "-")}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}
            / 100 speed score
          </span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Vital
            label="LCP"
            value={lcp == null ? "-" : `${(lcp / 1000).toFixed(1)}s`}
            tone={toneFor(lcp, 2500, 4000)}
          />
          <Vital
            label="INP"
            value={inp == null ? "-" : `${Math.round(inp)}ms`}
            tone={toneFor(inp, 200, 500)}
          />
          <Vital
            label="CLS"
            value={cls == null ? "-" : cls.toFixed(2)}
            tone={toneFor(cls, 0.1, 0.25)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Measured{" "}
          {privacy.enabled ? "********" : relativeTime(latest.measured_on)}
        </p>
      </CardContent>
    </Card>
  );
}
