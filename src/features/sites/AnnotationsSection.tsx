import { useState, type FormEvent } from "react";
import { Flag, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
} from "@/lib/hooks";
import { usePrivacyMode } from "@/lib/privacy";
import type { AnnotationKind } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<AnnotationKind, string> = {
  deploy: "border-primary/30 bg-primary/10 text-primary",
  content: "border-success/30 bg-success/10 text-success",
  seo: "border-warning/30 bg-warning/10 text-warning",
  other: "border-border bg-muted text-muted-foreground",
};

/**
 * Event log for chart markers: deploys, content pushes, SEO changes. Entries
 * scoped to this site plus portfolio-wide ones.
 */
export function AnnotationsSection({ siteId }: { siteId: string }) {
  const privacy = usePrivacyMode();
  const annotationsQuery = useAnnotations(siteId);
  const deleteAnnotation = useDeleteAnnotation();
  const [adding, setAdding] = useState(false);

  const annotations = annotationsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Events</h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={privacy.enabled}
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Log event
        </Button>
      </div>

      {adding && (
        <AnnotationForm siteId={siteId} onDone={() => setAdding(false)} />
      )}

      {annotations.length === 0 && !adding ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Flag className="h-4 w-4" aria-hidden />
            No events logged. Deploys, content pushes, and SEO changes appear as
            markers on the trajectory chart, so traffic shifts have
            explanations.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {annotations.slice(0, 12).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      KIND_STYLE[a.kind],
                    )}
                  >
                    {a.kind}
                  </span>
                  <span className="truncate">{privacy.maskText(a.label)}</span>
                  {a.site_id == null && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      portfolio-wide
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {privacy.enabled ? "********" : a.event_date}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete event"
                    className="text-muted-foreground transition-colors hover:text-critical"
                    disabled={deleteAnnotation.isPending}
                    onClick={() => deleteAnnotation.mutate(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function AnnotationForm({
  siteId,
  onDone,
}: {
  siteId: string;
  onDone: () => void;
}) {
  const createAnnotation = useCreateAnnotation();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AnnotationKind>("content");
  const [eventDate, setEventDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [portfolioWide, setPortfolioWide] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    createAnnotation.mutate(
      {
        siteId: portfolioWide ? null : siteId,
        eventDate,
        label: label.trim(),
        kind,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="annotation-label">What happened</Label>
            <Input
              id="annotation-label"
              required
              maxLength={80}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Republished top 10 guides"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="annotation-kind">Kind</Label>
            <select
              id="annotation-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as AnnotationKind)}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="deploy">Deploy</option>
              <option value="content">Content</option>
              <option value="seo">SEO</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="annotation-date">Date</Label>
            <Input
              id="annotation-date"
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={createAnnotation.isPending}
            >
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-5">
            <input
              type="checkbox"
              checked={portfolioWide}
              onChange={(e) => setPortfolioWide(e.target.checked)}
            />
            Applies to every site (e.g. a search-engine algorithm update)
          </label>
        </form>
        {createAnnotation.isError && (
          <Alert tone="error" className="mt-3">
            {(createAnnotation.error as Error).message}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
