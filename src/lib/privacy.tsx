import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "site-analytics-privacy-mode";
const MASK = "********";

interface PrivacyModeContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  maskText: (value: string | null | undefined, key?: string) => string;
  maskNumber: (
    value: number | null | undefined,
    key: string,
    options?: { min?: number; max?: number; decimals?: number },
  ) => number | null;
}

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

const DISABLED_PRIVACY: PrivacyModeContextValue = {
  enabled: false,
  setEnabled: () => {},
  toggle: () => {},
  maskText: (value) => value ?? "",
  maskNumber: (value) => value ?? null,
};

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(key: string): number {
  return hash(key) / 0xffffffff;
}

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readInitial);

  function setEnabled(next: boolean) {
    setEnabledState(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  useEffect(() => {
    document.documentElement.dataset.privacyMode = enabled ? "on" : "off";
  }, [enabled]);

  const value = useMemo<PrivacyModeContextValue>(
    () => ({
      enabled,
      setEnabled,
      toggle: () => setEnabled(!enabled),
      maskText: (text) => {
        if (!enabled) return text ?? "";
        return MASK;
      },
      maskNumber: (valueToMask, key, options = {}) => {
        if (!enabled) return valueToMask ?? null;
        const min = options.min ?? 0;
        const max = options.max;
        const decimals = options.decimals ?? 0;
        const range =
          max != null ? max - min : Math.max(10, Math.abs(min) + 100);
        const base =
          valueToMask == null || Number.isNaN(valueToMask)
            ? min + unit(`${key}:fallback`) * range
            : valueToMask;
        const factor = 0.55 + unit(`${key}:factor`) * 1.35;
        const jitter =
          (unit(`${key}:jitter`) - (min < 0 ? 0.5 : 0)) *
          Math.max(8, Math.abs(base) * 0.2);
        let masked = base * factor + jitter;
        if (valueToMask == null && max != null) {
          masked = min + unit(`${key}:bounded`) * range;
        }
        masked = Math.max(min, masked);
        if (max != null) masked = Math.min(max, masked);
        return decimals > 0
          ? Number(masked.toFixed(decimals))
          : Math.round(masked);
      },
    }),
    [enabled],
  );

  return (
    <PrivacyModeContext.Provider value={value}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode(): PrivacyModeContextValue {
  const value = useContext(PrivacyModeContext);
  return value ?? DISABLED_PRIVACY;
}
