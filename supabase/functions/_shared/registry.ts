import type { SyncAdapter } from "./sync-run.ts";
import type { SyncSource } from "./validate.ts";
import { gscAdapter } from "./gsc.ts";
import { ga4Adapter } from "./ga4.ts";
import { bingAdapter } from "./bing.ts";

export const ADAPTERS: Record<SyncSource, SyncAdapter> = {
  gsc: gscAdapter,
  ga4: ga4Adapter,
  bing: bingAdapter,
};
