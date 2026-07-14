import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getIntegrationStatuses,
  getSite,
  getSiteMetrics,
  getSites,
  getSyncRuns,
  getInsights,
  getSiteSearchTerms,
  getDbUsage,
  runCleanup,
  invokeManualSync,
  saveSite,
  deleteSite,
  type ManualSource,
  type SyncRunFilters,
} from "@/lib/api";

// Stable query keys (brief §21) so manual sync (Phase 5) can invalidate
// precisely.
export const queryKeys = {
  insights: (days: number) => ["insights", days] as const,
  sites: ["sites"] as const,
  site: (siteId: string) => ["site", siteId] as const,
  siteMetrics: (siteId: string, days: number) =>
    ["site-metrics", siteId, days] as const,
  siteSearchTerms: (siteId: string, days: number) =>
    ["site-search-terms", siteId, days] as const,
  integrationStatuses: (siteId?: string) =>
    ["integration-statuses", siteId ?? null] as const,
  syncRuns: (filters: SyncRunFilters) => ["sync-runs", filters] as const,
  dbUsage: ["db-usage"] as const,
};

export function useSites() {
  return useQuery({ queryKey: queryKeys.sites, queryFn: getSites });
}

export function useInsights(days: number) {
  return useQuery({
    queryKey: queryKeys.insights(days),
    queryFn: () => getInsights(days),
    // Keep the prior range's data on screen while a new range loads, so toggling
    // 7/30/90 doesn't flash skeletons across the whole overview.
    placeholderData: keepPreviousData,
  });
}

export function useSite(siteId: string) {
  return useQuery({
    queryKey: queryKeys.site(siteId),
    queryFn: () => getSite(siteId),
    enabled: !!siteId,
  });
}

export function useSiteMetrics(siteId: string, days: number) {
  return useQuery({
    queryKey: queryKeys.siteMetrics(siteId, days),
    queryFn: () => getSiteMetrics(siteId, days),
    enabled: !!siteId,
  });
}

export function useSiteSearchTerms(siteId: string, days: number) {
  return useQuery({
    queryKey: queryKeys.siteSearchTerms(siteId, days),
    queryFn: () => getSiteSearchTerms(siteId, days),
    enabled: !!siteId,
  });
}

export function useIntegrationStatuses(siteId?: string) {
  return useQuery({
    queryKey: queryKeys.integrationStatuses(siteId),
    queryFn: () => getIntegrationStatuses(siteId),
  });
}

export function useSyncRuns(filters: SyncRunFilters) {
  return useQuery({
    queryKey: queryKeys.syncRuns(filters),
    queryFn: () => getSyncRuns(filters),
  });
}

export function useDbUsage() {
  return useQuery({ queryKey: queryKeys.dbUsage, queryFn: getDbUsage });
}

/** Run or preview the retention cleanup. A real run refreshes the views it
 * touches; a dry run leaves the cache untouched. */
export function useRunCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean) => runCleanup(dryRun),
    onSuccess: (result) => {
      if (result.dry_run) return;
      qc.invalidateQueries({ queryKey: queryKeys.dbUsage });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["site-metrics"] });
      qc.invalidateQueries({ queryKey: ["site-search-terms"] });
      qc.invalidateQueries({ queryKey: ["sync-runs"] });
    },
  });
}

/** Create/update a site, then refresh the lists that show it. */
export function useSaveSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSite,
    onSuccess: (site) => {
      qc.invalidateQueries({ queryKey: queryKeys.sites });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: queryKeys.site(site.id) });
    },
  });
}

/** Delete a site, then refresh the lists. */
export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sites });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

/** Manual sync mutation that refreshes every view touched by a sync (§20). */
export function useManualSync(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: ManualSource) => invokeManualSync(siteId, source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.site(siteId) });
      qc.invalidateQueries({ queryKey: ["site-metrics", siteId] });
      qc.invalidateQueries({ queryKey: ["sync-runs"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["integration-statuses"] });
    },
  });
}
