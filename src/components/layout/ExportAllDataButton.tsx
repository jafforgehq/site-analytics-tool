import { useState } from "react";
import { ChevronDown, Download, FileJson, Table } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { usePrivacyMode } from "@/lib/privacy";

type ExportFormat = "json" | "csv";
type TableMap = Record<string, unknown[]>;

function baseFilename(value: string): string {
  return `site-analytics-data-${value.replace(/[:.]/g, "-")}`;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(name: string, data: unknown) {
  downloadBlob(
    name,
    new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
  );
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: unknown[]): string {
  if (rows.length === 0) return "";
  const headers = [
    ...new Set(
      rows.flatMap((row) =>
        row && typeof row === "object" && !Array.isArray(row)
          ? Object.keys(row)
          : [],
      ),
    ),
  ];
  if (headers.length === 0) return "";
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers
        .map((header) =>
          csvCell(
            row && typeof row === "object" && !Array.isArray(row)
              ? (row as Record<string, unknown>)[header]
              : undefined,
          ),
        )
        .join(","),
    ),
  ].join("\n");
}

async function downloadCsvZip(name: string, tables: TableMap) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [table, rows] of Object.entries(tables)) {
    zip.file(`${table}.csv`, rowsToCsv(rows));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(name, blob);
}

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Could not export data.";
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isSensitiveTextKey(key: string): boolean {
  return [
    "name",
    "domain",
    "url",
    "property",
    "query",
    "page",
    "email",
    "message",
    "requested_by",
  ].some((part) => key.toLowerCase().includes(part));
}

function anonymizeExportValue(
  value: unknown,
  key: string,
  path: string,
  privacy: ReturnType<typeof usePrivacyMode>,
): unknown {
  if (typeof value === "number") {
    return privacy.maskNumber(value, path);
  }
  if (typeof value === "string") {
    const lower = key.toLowerCase();
    if (lower === "id" || lower.endsWith("_id")) {
      return `id_${hashText(value)}`;
    }
    if (isSensitiveTextKey(key)) return privacy.maskText(value, path);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      anonymizeExportValue(item, key, `${path}.${index}`, privacy),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        anonymizeExportValue(
          childValue,
          childKey,
          `${path}.${childKey}`,
          privacy,
        ),
      ]),
    );
  }
  return value;
}

function anonymizeExport<T>(
  data: T,
  privacy: ReturnType<typeof usePrivacyMode>,
): T {
  return {
    ...(anonymizeExportValue(data, "export", "export", privacy) as T),
    privacy_mode: true,
  };
}

export function ExportAllDataButton() {
  const privacy = usePrivacyMode();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(nextFormat: ExportFormat) {
    setExporting(true);
    setFormat(nextFormat);
    setError(null);
    try {
      const { getPortfolioDataExport } = await import("@/lib/api");
      const data = await getPortfolioDataExport();
      const exportData = privacy.enabled
        ? anonymizeExport(data, privacy)
        : data;
      const name = baseFilename(data.generated_at);
      if (nextFormat === "json") {
        downloadJson(`${name}.json`, exportData);
      } else {
        await downloadCsvZip(`${name}-csv.zip`, exportData.tables);
      }
      setOpen(false);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setExporting(false);
      setFormat(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={exporting}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          exporting && "text-foreground",
        )}
      >
        {exporting ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {exporting ? "Exporting data" : "Export all data"}
        {!exporting && <ChevronDown className="ml-auto h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-1 rounded-md border border-border bg-background p-1 shadow-sm">
          <FormatButton
            icon={FileJson}
            label="JSON"
            description="Single structured bundle"
            loading={exporting && format === "json"}
            onClick={() => void handleExport("json")}
          />
          <FormatButton
            icon={Table}
            label="CSV zip"
            description="One CSV file per table"
            loading={exporting && format === "csv"}
            onClick={() => void handleExport("csv")}
          />
        </div>
      )}
      {error && <p className="px-3 text-xs text-critical">{error}</p>}
    </div>
  );
}

function FormatButton({
  icon: Icon,
  label,
  description,
  loading,
  onClick,
}: {
  icon: typeof FileJson;
  label: string;
  description: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      <span>
        <span className="block font-medium text-foreground">{label}</span>
        <span>{description}</span>
      </span>
    </button>
  );
}
