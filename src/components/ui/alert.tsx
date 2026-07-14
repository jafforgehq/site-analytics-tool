import { type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "error" | "success" | "info";

const TONES: Record<Tone, { wrap: string; Icon: typeof AlertCircle }> = {
  error: {
    wrap: "border-critical/30 bg-critical/10 text-foreground",
    Icon: AlertCircle,
  },
  success: {
    wrap: "border-success/30 bg-success/10 text-foreground",
    Icon: CheckCircle2,
  },
  info: {
    wrap: "border-border bg-muted text-foreground",
    Icon: Info,
  },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const { wrap, Icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        wrap,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
