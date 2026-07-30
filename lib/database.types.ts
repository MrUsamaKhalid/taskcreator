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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          anthropic_file_id: string | null
          created_at: string
          description: string | null
          extracted_text: string | null
          extraction_status: Database["public"]["Enums"]["extraction_status"]
          filename: string
          id: string
          mime: string
          prompt_version_id: string
          role: Database["public"]["Enums"]["attachment_role"]
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          anthropic_file_id?: string | null
          created_at?: string
          description?: string | null
          extracted_text?: string | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          filename: string
          id?: string
          mime: string
          prompt_version_id: string
          role?: Database["public"]["Enums"]["attachment_role"]
          size_bytes: number
          storage_path: string
          user_id?: string
        }
        Update: {
          anthropic_file_id?: string | null
          created_at?: string
          description?: string | null
          extracted_text?: string | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          filename?: string
          id?: string
          mime?: string
          prompt_version_id?: string
          role?: Database["public"]["Enums"]["attachment_role"]
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          category: Database["public"]["Enums"]["checklist_category"]
          created_at: string
          id: string
          ordinal: number
          prompt_version_id: string
          source: Database["public"]["Enums"]["item_source"]
          text: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["checklist_category"]
          created_at?: string
          id?: string
          ordinal?: number
          prompt_version_id: string
          source?: Database["public"]["Enums"]["item_source"]
          text: string
          user_id?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["checklist_category"]
          created_at?: string
          id?: string
          ordinal?: number
          prompt_version_id?: string
          source?: Database["public"]["Enums"]["item_source"]
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          job_title: string | null
          sector: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          job_title?: string | null
          sector?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_title?: string | null
          sector?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          brief: Json
          compile_mode: Database["public"]["Enums"]["compile_mode"] | null
          compiled_prompt: string | null
          created_at: string
          dismissed_chips: string[]
          draft_prompt: string
          id: string
          prompt_id: string
          updated_at: string
          user_id: string
          version_no: number
        }
        Insert: {
          brief?: Json
          compile_mode?: Database["public"]["Enums"]["compile_mode"] | null
          compiled_prompt?: string | null
          created_at?: string
          dismissed_chips?: string[]
          draft_prompt?: string
          id?: string
          prompt_id: string
          updated_at?: string
          user_id?: string
          version_no?: number
        }
        Update: {
          brief?: Json
          compile_mode?: Database["public"]["Enums"]["compile_mode"] | null
          compiled_prompt?: string | null
          created_at?: string
          dismissed_chips?: string[]
          draft_prompt?: string
          id?: string
          prompt_id?: string
          updated_at?: string
          user_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          created_at: string
          current_version_id: string | null
          id: string
          job_title: string | null
          sector: string | null
          status: Database["public"]["Enums"]["prompt_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          job_title?: string | null
          sector?: string | null
          status?: Database["public"]["Enums"]["prompt_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          job_title?: string | null
          sector?: string | null
          status?: Database["public"]["Enums"]["prompt_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          brief_rating: Database["public"]["Enums"]["rating"] | null
          created_at: string
          files_rating: Database["public"]["Enums"]["rating"] | null
          id: string
          model: string
          payload: Json
          prompt_rating: Database["public"]["Enums"]["rating"] | null
          prompt_version_id: string
          usage: Json | null
          user_id: string
        }
        Insert: {
          brief_rating?: Database["public"]["Enums"]["rating"] | null
          created_at?: string
          files_rating?: Database["public"]["Enums"]["rating"] | null
          id?: string
          model: string
          payload: Json
          prompt_rating?: Database["public"]["Enums"]["rating"] | null
          prompt_version_id: string
          usage?: Json | null
          user_id?: string
        }
        Update: {
          brief_rating?: Database["public"]["Enums"]["rating"] | null
          created_at?: string
          files_rating?: Database["public"]["Enums"]["rating"] | null
          id?: string
          model?: string
          payload?: Json
          prompt_rating?: Database["public"]["Enums"]["rating"] | null
          prompt_version_id?: string
          usage?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_run_results: {
        Row: {
          checklist_item_id: string | null
          created_at: string
          evidence: string | null
          id: string
          item_text: string
          passed: boolean
          test_run_id: string
          user_id: string
        }
        Insert: {
          checklist_item_id?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          item_text: string
          passed: boolean
          test_run_id: string
          user_id?: string
        }
        Update: {
          checklist_item_id?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          item_text?: string
          passed?: boolean
          test_run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_run_results_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_run_results_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          created_at: string
          effort: string | null
          id: string
          model: string
          output_text: string | null
          prompt_version_id: string
          score_pct: number | null
          usage: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          effort?: string | null
          id?: string
          model: string
          output_text?: string | null
          prompt_version_id: string
          score_pct?: number | null
          usage?: Json | null
          user_id?: string
        }
        Update: {
          created_at?: string
          effort?: string | null
          id?: string
          model?: string
          output_text?: string | null
          prompt_version_id?: string
          score_pct?: number | null
          usage?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attachment_role: "input" | "brand" | "excluded"
      checklist_category: "format" | "content" | "substance"
      compile_mode: "structured" | "natural"
      extraction_status: "ok" | "unsupported" | "failed" | "not_needed"
      item_source: "ai" | "manual"
      prompt_status: "draft" | "reviewed" | "ready" | "tested"
      rating: "excellent" | "good" | "needs_work" | "missing"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attachment_role: ["input", "brand", "excluded"],
      checklist_category: ["format", "content", "substance"],
      compile_mode: ["structured", "natural"],
      extraction_status: ["ok", "unsupported", "failed", "not_needed"],
      item_source: ["ai", "manual"],
      prompt_status: ["draft", "reviewed", "ready", "tested"],
      rating: ["excellent", "good", "needs_work", "missing"],
    },
  },
} as const
