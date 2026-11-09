export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      commission_rule_versions: {
        Row: {
          created_at: string
          created_xid: unknown
          effective_from: string
          fixed_percent: number | null
          id: string
          mode: string
          publication_operation_id: string
          revision: number
          sealed: boolean
          user_id: string
          workplace_id: string
        }
        Insert: {
          created_at?: string
          created_xid?: unknown
          effective_from: string
          fixed_percent?: number | null
          id?: string
          mode: string
          publication_operation_id: string
          revision: number
          sealed?: boolean
          user_id: string
          workplace_id: string
        }
        Update: {
          created_at?: string
          created_xid?: unknown
          effective_from?: string
          fixed_percent?: number | null
          id?: string
          mode?: string
          publication_operation_id?: string
          revision?: number
          sealed?: boolean
          user_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rule_versions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rule_versions_user_id_publication_operation_id_fkey"
            columns: ["user_id", "publication_operation_id"]
            isOneToOne: false
            referencedRelation: "operation_requests"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "commission_rule_versions_user_id_workplace_id_fkey"
            columns: ["user_id", "workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      commission_thresholds: {
        Row: {
          from_amount: number
          id: string
          percent: number
          rule_version_id: string
          user_id: string
          workplace_id: string
        }
        Insert: {
          from_amount: number
          id?: string
          percent: number
          rule_version_id: string
          user_id: string
          workplace_id: string
        }
        Update: {
          from_amount?: number
          id?: string
          percent?: number
          rule_version_id?: string
          user_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_thresholds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_thresholds_user_id_workplace_id_rule_version_id_fkey"
            columns: ["user_id", "workplace_id", "rule_version_id"]
            isOneToOne: false
            referencedRelation: "commission_rule_versions"
            referencedColumns: ["user_id", "workplace_id", "id"]
          },
        ]
      }
      monthly_commission_results: {
        Row: {
          applied_percent: number | null
          auto_zeroed_count: number
          calculation_available: boolean
          closed_at: string | null
          commission_amount: number | null
          completed_count: number
          computed_at: string
          id: string
          input_digest: string
          last_operation_id: string
          missing_revenue_count: number
          month: string
          reached_threshold_from: number | null
          revenue_total: number
          revision: number
          rule_version_id: string | null
          state: string
          user_id: string
          workplace_id: string
        }
        Insert: {
          applied_percent?: number | null
          auto_zeroed_count: number
          calculation_available: boolean
          closed_at?: string | null
          commission_amount?: number | null
          completed_count: number
          computed_at?: string
          id?: string
          input_digest: string
          last_operation_id: string
          missing_revenue_count: number
          month: string
          reached_threshold_from?: number | null
          revenue_total: number
          revision?: number
          rule_version_id?: string | null
          state: string
          user_id: string
          workplace_id: string
        }
        Update: {
          applied_percent?: number | null
          auto_zeroed_count?: number
          calculation_available?: boolean
          closed_at?: string | null
          commission_amount?: number | null
          completed_count?: number
          computed_at?: string
          id?: string
          input_digest?: string
          last_operation_id?: string
          missing_revenue_count?: number
          month?: string
          reached_threshold_from?: number | null
          revenue_total?: number
          revision?: number
          rule_version_id?: string | null
          state?: string
          user_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_commission_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_commission_results_user_id_last_operation_id_fkey"
            columns: ["user_id", "last_operation_id"]
            isOneToOne: false
            referencedRelation: "operation_requests"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "monthly_commission_results_user_id_workplace_id_fkey"
            columns: ["user_id", "workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "monthly_commission_results_user_id_workplace_id_rule_versi_fkey"
            columns: ["user_id", "workplace_id", "rule_version_id"]
            isOneToOne: false
            referencedRelation: "commission_rule_versions"
            referencedColumns: ["user_id", "workplace_id", "id"]
          },
        ]
      }
      operation_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation_type: string
          request_payload: Json
          response_payload: Json | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation_type: string
          request_payload: Json
          response_payload?: Json | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation_type?: string
          request_payload?: Json
          response_payload?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          hours_goal: number | null
          id: string
          monthly_goal: number | null
          name: string
          revision: number
          shifts_goal: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          hours_goal?: number | null
          id: string
          monthly_goal?: number | null
          name: string
          revision?: number
          shifts_goal?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          hours_goal?: number | null
          id?: string
          monthly_goal?: number | null
          name?: string
          revision?: number
          shifts_goal?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_intervals: {
        Row: {
          end_time: string | null
          fixed_amount: number | null
          hourly: number | null
          id: string
          kind: string
          label: string
          rate_version_id: string
          sort_order: number
          start_time: string | null
          user_id: string
          weekdays: number[]
          workplace_id: string
        }
        Insert: {
          end_time?: string | null
          fixed_amount?: number | null
          hourly?: number | null
          id?: string
          kind: string
          label: string
          rate_version_id: string
          sort_order?: number
          start_time?: string | null
          user_id: string
          weekdays?: number[]
          workplace_id: string
        }
        Update: {
          end_time?: string | null
          fixed_amount?: number | null
          hourly?: number | null
          id?: string
          kind?: string
          label?: string
          rate_version_id?: string
          sort_order?: number
          start_time?: string | null
          user_id?: string
          weekdays?: number[]
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_intervals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_intervals_user_id_workplace_id_rate_version_id_fkey"
            columns: ["user_id", "workplace_id", "rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["user_id", "workplace_id", "id"]
          },
        ]
      }
      rate_versions: {
        Row: {
          created_at: string
          created_xid: unknown
          effective_from: string
          id: string
          note: string | null
          overlap_acknowledged_at: string | null
          publication_operation_id: string
          revision: number
          sealed: boolean
          user_id: string
          workplace_id: string
        }
        Insert: {
          created_at?: string
          created_xid?: unknown
          effective_from: string
          id?: string
          note?: string | null
          overlap_acknowledged_at?: string | null
          publication_operation_id: string
          revision: number
          sealed?: boolean
          user_id: string
          workplace_id: string
        }
        Update: {
          created_at?: string
          created_xid?: unknown
          effective_from?: string
          id?: string
          note?: string | null
          overlap_acknowledged_at?: string | null
          publication_operation_id?: string
          revision?: number
          sealed?: boolean
          user_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_versions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_versions_user_id_publication_operation_id_fkey"
            columns: ["user_id", "publication_operation_id"]
            isOneToOne: false
            referencedRelation: "operation_requests"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "rate_versions_user_id_workplace_id_fkey"
            columns: ["user_id", "workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      shift_adjustments: {
        Row: {
          amount: number | null
          comment: string | null
          created_at: string
          id: string
          kind: string
          label: string
          shift_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          amount?: number | null
          comment?: string | null
          created_at?: string
          id?: string
          kind: string
          label: string
          shift_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          amount?: number | null
          comment?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          shift_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_adjustments_user_id_shift_id_fkey"
            columns: ["user_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      shift_financial_events: {
        Row: {
          after_snapshot: Json
          before_snapshot: Json
          context: Json
          created_at: string
          event_type: string
          id: string
          operation_id: string
          shift_id: string | null
          subject_shift_id: string | null
          user_id: string
        }
        Insert: {
          after_snapshot: Json
          before_snapshot: Json
          context?: Json
          created_at?: string
          event_type: string
          id?: string
          operation_id: string
          shift_id?: string | null
          subject_shift_id?: string | null
          user_id: string
        }
        Update: {
          after_snapshot?: Json
          before_snapshot?: Json
          context?: Json
          created_at?: string
          event_type?: string
          id?: string
          operation_id?: string
          shift_id?: string | null
          subject_shift_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_financial_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_financial_events_user_id_operation_id_fkey"
            columns: ["user_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "operation_requests"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "shift_financial_events_user_id_shift_id_fkey"
            columns: ["user_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      shift_fixed_payments: {
        Row: {
          amount_snapshot: number | null
          id: string
          label_snapshot: string
          rate_interval_id: string
          selected_at: string
          selection_operation_id: string
          shift_id: string
          source_kind: string
          user_id: string
          workplace_id: string
        }
        Insert: {
          amount_snapshot?: number | null
          id?: string
          label_snapshot: string
          rate_interval_id: string
          selected_at?: string
          selection_operation_id: string
          shift_id: string
          source_kind?: string
          user_id: string
          workplace_id: string
        }
        Update: {
          amount_snapshot?: number | null
          id?: string
          label_snapshot?: string
          rate_interval_id?: string
          selected_at?: string
          selection_operation_id?: string
          shift_id?: string
          source_kind?: string
          user_id?: string
          workplace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_fixed_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_fixed_payments_user_id_selection_operation_id_fkey"
            columns: ["user_id", "selection_operation_id"]
            isOneToOne: false
            referencedRelation: "operation_requests"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "shift_fixed_payments_user_id_workplace_id_rate_interval_id_fkey"
            columns: [
              "user_id",
              "workplace_id",
              "rate_interval_id",
              "source_kind",
            ]
            isOneToOne: false
            referencedRelation: "rate_intervals"
            referencedColumns: ["user_id", "workplace_id", "id", "kind"]
          },
          {
            foreignKeyName: "shift_fixed_payments_user_id_workplace_id_shift_id_fkey"
            columns: ["user_id", "workplace_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["user_id", "workplace_id", "id"]
          },
        ]
      }
      shifts: {
        Row: {
          base_pay: number | null
          comment: string | null
          commission_pay: number | null
          commission_source: string
          created_at: string
          deleted_at: string | null
          earnings: number | null
          end_time: string
          ends_at: string
          fixed_pay: number | null
          id: string
          local_end_date: string
          local_start_date: string
          rate_version_id: string | null
          revenue: number | null
          revenue_auto_zeroed: boolean
          revenue_revision: number
          revision: number
          start_time: string
          starts_at: string
          status: string
          tips: number | null
          updated_at: string
          user_id: string
          workplace_id: string
          workplace_timezone: string
        }
        Insert: {
          base_pay?: number | null
          comment?: string | null
          commission_pay?: number | null
          commission_source?: string
          created_at?: string
          deleted_at?: string | null
          earnings?: number | null
          end_time: string
          ends_at: string
          fixed_pay?: number | null
          id?: string
          local_end_date: string
          local_start_date: string
          rate_version_id?: string | null
          revenue?: number | null
          revenue_auto_zeroed?: boolean
          revenue_revision?: number
          revision?: number
          start_time: string
          starts_at: string
          status?: string
          tips?: number | null
          updated_at?: string
          user_id: string
          workplace_id: string
          workplace_timezone: string
        }
        Update: {
          base_pay?: number | null
          comment?: string | null
          commission_pay?: number | null
          commission_source?: string
          created_at?: string
          deleted_at?: string | null
          earnings?: number | null
          end_time?: string
          ends_at?: string
          fixed_pay?: number | null
          id?: string
          local_end_date?: string
          local_start_date?: string
          rate_version_id?: string | null
          revenue?: number | null
          revenue_auto_zeroed?: boolean
          revenue_revision?: number
          revision?: number
          start_time?: string
          starts_at?: string
          status?: string
          tips?: number | null
          updated_at?: string
          user_id?: string
          workplace_id?: string
          workplace_timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_user_id_workplace_id_fkey"
            columns: ["user_id", "workplace_id"]
            isOneToOne: false
            referencedRelation: "workplaces"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "shifts_user_id_workplace_id_rate_version_id_fkey"
            columns: ["user_id", "workplace_id", "rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["user_id", "workplace_id", "id"]
          },
        ]
      }
      workplaces: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          id: string
          name: string
          revenue_goal: number | null
          revision: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color: string
          created_at?: string
          id?: string
          name: string
          revenue_goal?: number | null
          revision?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          id?: string
          name?: string
          revenue_goal?: number | null
          revision?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workplaces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      shiftly_close_month: {
        Args: {
          p_key: string
          p_month: string
          p_user: string
          p_workplace: string
        }
        Returns: Json
      }
      shiftly_write: {
        Args: { p_key: string; p_payload: Json; p_type: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
