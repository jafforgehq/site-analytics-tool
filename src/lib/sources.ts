import type { SyncSource } from "@/types/database";

export const SOURCES: SyncSource[] = ["gsc", "ga4", "bing"];

export const SOURCE_LABEL: Record<SyncSource, string> = {
  gsc: "Search Console",
  ga4: "Analytics",
  bing: "Bing",
};

export const SOURCE_SHORT: Record<SyncSource, string> = {
  gsc: "GSC",
  ga4: "GA4",
  bing: "Bing",
};
