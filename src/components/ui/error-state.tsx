import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sanitized error display - shows a friendly message, never the raw provider
 * or database error, with an optional retry.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this data. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-critical/30 bg-critical/5 px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-critical" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
