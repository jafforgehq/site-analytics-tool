import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Placeholder for the AI briefing feature. The backend (ai-briefing Edge
 * Function, useAiBriefing hook, buildBriefingSummary) is fully built and
 * deployed - it just isn't surfaced in the UI yet, since it needs an
 * ANTHROPIC_API_KEY secret configured before it does anything useful.
 * Swap this card for the interactive version once that's ready to launch.
 */
export function BriefingCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold text-muted-foreground">
            AI briefing
          </span>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Coming soon
        </span>
      </CardContent>
    </Card>
  );
}
