import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden />
  );
}

export function FullPageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-6 w-6 text-muted-foreground" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
