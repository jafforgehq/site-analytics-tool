// Database types for the Site Analytics schema.
//
// Hand-authored to mirror supabase/migrations/0001_initial_schema.sql. Once a
// Supabase project is linked you can regenerate this file with:
//   supabase gen types typescript --linked > src/types/database.ts
// Keep it in sync with the migrations if you edit it by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SyncSource = "gsc" | "ga4" | "bing";
export type SearchEngine = "google" | "bing";
export type SyncStatus = "running" | "success" | "partial" | "failed";
export type TriggerType = "scheduled" | "manual" | "backfill";

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string;
          name: string;
          domain: string;
          website_url: string;
          gsc_property: string | null;
          ga4_property_id: string | null;
          bing_site_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          domain: string;
          website_url: string;
          gsc_property?: string | null;
          ga4_property_id?: string | null;
          bing_site_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sites"]["Insert"]>;
        Relationships: [];
      };
      analytics_daily: {
        Row: {
          site_id: string;
          metric_date: string;
          active_users: number;
          total_users: number;
          sessions: number;
          screen_page_views: number;
          engaged_sessions: number;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          metric_date: string;
          active_users?: number;
          total_users?: number;
          sessions?: number;
          screen_page_views?: number;
          engaged_sessions?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["analytics_daily"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "analytics_daily_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      search_daily: {
        Row: {
          site_id: string;
          engine: SearchEngine;
          metric_date: string;
          clicks: number;
          impressions: number;
          ctr: number | null;
          average_position: number | null;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          engine: SearchEngine;
          metric_date: string;
          clicks?: number;
          impressions?: number;
          ctr?: number | null;
          average_position?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_daily"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "search_daily_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      search_query_daily: {
        Row: {
          site_id: string;
          engine: SearchEngine;
          metric_date: string;
          query: string;
          clicks: number;
          impressions: number;
          ctr: number | null;
          average_position: number | null;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          engine: SearchEngine;
          metric_date: string;
          query: string;
          clicks?: number;
          impressions?: number;
          ctr?: number | null;
          average_position?: number | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["search_query_daily"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "search_query_daily_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      search_page_daily: {
        Row: {
          site_id: string;
          engine: SearchEngine;
          metric_date: string;
          page: string;
          clicks: number;
          impressions: number;
          ctr: number | null;
          average_position: number | null;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          engine: SearchEngine;
          metric_date: string;
          page: string;
          clicks?: number;
          impressions?: number;
          ctr?: number | null;
          average_position?: number | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["search_page_daily"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "search_page_daily_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_runs: {
        Row: {
          id: string;
          site_id: string;
          source: SyncSource;
          trigger_type: TriggerType;
          requested_by: string | null;
          range_start: string | null;
          range_end: string | null;
          started_at: string;
          finished_at: string | null;
          status: SyncStatus;
          rows_fetched: number;
          rows_written: number;
          duration_ms: number | null;
          error_code: string | null;
          error_message: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          site_id: string;
          source: SyncSource;
          trigger_type: TriggerType;
          requested_by?: string | null;
          range_start?: string | null;
          range_end?: string | null;
          started_at?: string;
          finished_at?: string | null;
          status?: SyncStatus;
          rows_fetched?: number;
          rows_written?: number;
          duration_ms?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["sync_runs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sync_runs_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_status: {
        Row: {
          site_id: string;
          source: SyncSource;
          enabled: boolean;
          last_attempt_at: string | null;
          last_success_at: string | null;
          last_status: SyncStatus | null;
          last_duration_ms: number | null;
          last_rows_fetched: number;
          last_rows_written: number;
          consecutive_failures: number;
          last_error_code: string | null;
          last_error_message: string | null;
          next_run_at: string | null;
          stale_after_hours: number;
          updated_at: string;
        };
        Insert: {
          site_id: string;
          source: SyncSource;
          enabled?: boolean;
          last_attempt_at?: string | null;
          last_success_at?: string | null;
          last_status?: SyncStatus | null;
          last_duration_ms?: number | null;
          last_rows_fetched?: number;
          last_rows_written?: number;
          consecutive_failures?: number;
          last_error_code?: string | null;
          last_error_message?: string | null;
          next_run_at?: string | null;
          stale_after_hours?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["integration_status"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "integration_status_site_id_fkey";
            columns: ["site_id"];
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_portfolio_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      get_db_usage: {
        Args: Record<never, never>;
        Returns: Json;
      };
      run_cleanup: {
        Args: { p_dry_run?: boolean };
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

// Convenience helpers ---------------------------------------------------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Site = Tables<"sites">;
export type AnalyticsDaily = Tables<"analytics_daily">;
export type SearchDaily = Tables<"search_daily">;
export type SearchQueryDaily = Tables<"search_query_daily">;
export type SearchPageDaily = Tables<"search_page_daily">;
export type SyncRun = Tables<"sync_runs">;
export type IntegrationStatus = Tables<"integration_status">;
