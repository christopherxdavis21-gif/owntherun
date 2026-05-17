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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"]
          code: string
          created_at: string
          criteria: Json
          description: string
          icon: string
          sort_order: number
          tier: Database["public"]["Enums"]["achievement_tier"]
          title: string
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"]
          code: string
          created_at?: string
          criteria: Json
          description: string
          icon?: string
          sort_order?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
          title: string
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"]
          code?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string
          sort_order?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
          title?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          is_system: boolean
          metric: Database["public"]["Enums"]["challenge_metric"]
          scope: Database["public"]["Enums"]["challenge_scope"]
          scope_id: string | null
          starts_at: string
          target_value: number
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          is_system?: boolean
          metric: Database["public"]["Enums"]["challenge_metric"]
          scope: Database["public"]["Enums"]["challenge_scope"]
          scope_id?: string | null
          starts_at?: string
          target_value: number
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          is_system?: boolean
          metric?: Database["public"]["Enums"]["challenge_metric"]
          scope?: Database["public"]["Enums"]["challenge_scope"]
          scope_id?: string | null
          starts_at?: string
          target_value?: number
          title?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          clan_tag: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_url: string | null
          invite_code: string
          is_public: boolean
          name: string
          updated_at: string
        }
        Insert: {
          clan_tag?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_url?: string | null
          invite_code?: string
          is_public?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          clan_tag?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_url?: string | null
          invite_code?: string
          is_public?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      medals: {
        Row: {
          awarded_at: string
          category: string
          id: string
          period_start: string
          period_type: string
          rank: number
          scope: string
          scope_id: string | null
          user_id: string
        }
        Insert: {
          awarded_at?: string
          category: string
          id?: string
          period_start: string
          period_type: string
          rank: number
          scope: string
          scope_id?: string | null
          user_id: string
        }
        Update: {
          awarded_at?: string
          category?: string
          id?: string
          period_start?: string
          period_type?: string
          rank?: number
          scope?: string
          scope_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birthdate: string | null
          clan_group_id: string | null
          clan_tag: string | null
          created_at: string
          display_name: string
          email_verified: boolean
          gender: string | null
          id: string
          is_verified: boolean
          phone_number: string | null
          phone_verified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birthdate?: string | null
          clan_group_id?: string | null
          clan_tag?: string | null
          created_at?: string
          display_name: string
          email_verified?: boolean
          gender?: string | null
          id?: string
          is_verified?: boolean
          phone_number?: string | null
          phone_verified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birthdate?: string | null
          clan_group_id?: string | null
          clan_tag?: string | null
          created_at?: string
          display_name?: string
          email_verified?: boolean
          gender?: string | null
          id?: string
          is_verified?: boolean
          phone_number?: string | null
          phone_verified?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          coordinates: Json
          created_at: string
          description: string | null
          distance_meters: number
          id: string
          is_public: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coordinates?: Json
          created_at?: string
          description?: string | null
          distance_meters?: number
          id?: string
          is_public?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coordinates?: Json
          created_at?: string
          description?: string | null
          distance_meters?: number
          id?: string
          is_public?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      run_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          run_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          run_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          run_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_comments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          created_at: string
          distance_meters: number
          duration_seconds: number
          elevation_gain_meters: number
          id: string
          notes: string | null
          ran_at: string
          route_id: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["run_visibility"]
        }
        Insert: {
          created_at?: string
          distance_meters: number
          duration_seconds: number
          elevation_gain_meters?: number
          id?: string
          notes?: string | null
          ran_at?: string
          route_id?: string | null
          user_id: string
          visibility?: Database["public"]["Enums"]["run_visibility"]
        }
        Update: {
          created_at?: string
          distance_meters?: number
          duration_seconds?: number
          elevation_gain_meters?: number
          id?: string
          notes?: string | null
          ran_at?: string
          route_id?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["run_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "runs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_routes: {
        Row: {
          id: string
          route_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          id?: string
          route_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          id?: string
          route_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          age_filter: string | null
          category: string
          created_at: string
          distance_filter: string | null
          gender_filter: string | null
          id: string
          is_default: boolean
          name: string
          time_filter: string
          user_id: string
        }
        Insert: {
          age_filter?: string | null
          category: string
          created_at?: string
          distance_filter?: string | null
          gender_filter?: string | null
          id?: string
          is_default?: boolean
          name: string
          time_filter: string
          user_id: string
        }
        Update: {
          age_filter?: string | null
          category?: string
          created_at?: string
          distance_filter?: string | null
          gender_filter?: string | null
          id?: string
          is_default?: boolean
          name?: string
          time_filter?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_code: string
          earned_at: string
          id: string
          run_id: string | null
          user_id: string
        }
        Insert: {
          achievement_code: string
          earned_at?: string
          id?: string
          run_id?: string | null
          user_id: string
        }
        Update: {
          achievement_code?: string
          earned_at?: string
          id?: string
          run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      user_challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          id: string
          joined_at: string
          progress_value: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          id?: string
          joined_at?: string
          progress_value?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          id?: string
          joined_at?: string
          progress_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stats: {
        Row: {
          current_streak_days: number
          fastest_mile_seconds: number | null
          last_run_at: string | null
          lifetime_elevation: number
          lifetime_meters: number
          lifetime_runs: number
          lifetime_seconds: number
          longest_run_meters: number
          longest_streak_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak_days?: number
          fastest_mile_seconds?: number | null
          last_run_at?: string | null
          lifetime_elevation?: number
          lifetime_meters?: number
          lifetime_runs?: number
          lifetime_seconds?: number
          longest_run_meters?: number
          longest_streak_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak_days?: number
          fastest_mile_seconds?: number | null
          last_run_at?: string | null
          lifetime_elevation?: number
          lifetime_meters?: number
          lifetime_runs?: number
          lifetime_seconds?: number
          longest_run_meters?: number
          longest_streak_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      achievement_category:
        | "distance"
        | "streak"
        | "elevation"
        | "speed"
        | "social"
        | "milestone"
      achievement_tier: "bronze" | "silver" | "gold" | "platinum"
      challenge_metric:
        | "distance_meters"
        | "elevation_meters"
        | "runs_count"
        | "streak_days"
        | "duration_seconds"
      challenge_scope: "system" | "group" | "personal"
      run_visibility: "private" | "public" | "leaderboard"
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
      achievement_category: [
        "distance",
        "streak",
        "elevation",
        "speed",
        "social",
        "milestone",
      ],
      achievement_tier: ["bronze", "silver", "gold", "platinum"],
      challenge_metric: [
        "distance_meters",
        "elevation_meters",
        "runs_count",
        "streak_days",
        "duration_seconds",
      ],
      challenge_scope: ["system", "group", "personal"],
      run_visibility: ["private", "public", "leaderboard"],
    },
  },
} as const
