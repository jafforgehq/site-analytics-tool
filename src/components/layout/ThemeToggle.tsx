import { Monitor, Moon, Sun } from "lucide-react";
import {
  nextThemePreference,
  useTheme,
  type ThemePreference,
} from "@/lib/theme";

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Cycles light → dark → system, matching the nav-item styling. */
export function ThemeToggle() {
  const theme = useTheme();
  const Icon = ICONS[theme.preference];

  return (
    <button
      type="button"
      onClick={theme.cycle}
      aria-label={`Theme: ${LABELS[theme.preference]}. Switch to ${
        LABELS[nextThemePreference(theme.preference)]
      }.`}
      className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-4 w-4" aria-hidden />
      Theme
      <span className="ml-auto text-xs">{LABELS[theme.preference]}</span>
    </button>
  );
}
