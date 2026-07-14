import { EyeOff } from "lucide-react";
import { usePrivacyMode } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export function PrivacyModeToggle() {
  const privacy = usePrivacyMode();

  return (
    <button
      type="button"
      aria-pressed={privacy.enabled}
      onClick={privacy.toggle}
      className={cn(
        "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        privacy.enabled && "bg-primary/10 text-primary hover:bg-primary/15",
      )}
    >
      <EyeOff className="h-4 w-4" aria-hidden />
      Hide all data
      {privacy.enabled && <span className="ml-auto text-xs">On</span>}
    </button>
  );
}
