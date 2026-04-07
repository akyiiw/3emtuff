export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; name: string; email: string | null; display_name: string | null; is_moderator: boolean | null; created_at: string; updated_at: string };
        Insert: { id: string; name: string; email?: string | null; display_name?: string | null; is_moderator?: boolean | null; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; email?: string | null; display_name?: string | null; is_moderator?: boolean | null; created_at?: string; updated_at?: string };

      };
      items: {
        Row: { id: string; subject_id: string; text: string; description: string | null; due_date: string | null; item_type: string; created_by: string; created_at: string; edited_by: string | null; updated_at: string | null };
        Insert: { id?: string; subject_id: string; text: string; description?: string | null; due_date?: string | null; item_type?: string; created_by: string; created_at?: string; edited_by?: string | null; updated_at?: string | null };
        Update: { id?: string; subject_id?: string; text?: string; description?: string | null; due_date?: string | null; item_type?: string; created_by?: string; created_at?: string; edited_by?: string | null; updated_at?: string | null };
      };
      item_links: {
        Row: { id: string; item_id: string; url: string; label: string | null; created_at: string };
        Insert: { id?: string; item_id: string; url: string; label?: string | null; created_at?: string };
        Update: { id?: string; item_id?: string; url?: string; label?: string | null; created_at?: string };
      };
      task_done: {
        Row: { id: string; item_id: string; user_id: string; done_at: string };
        Insert: { id?: string; item_id: string; user_id: string; done_at?: string };
        Update: { id?: string; item_id?: string; user_id?: string; done_at?: string };
      };
      forum_posts: {
        Row: { id: string; subject_id: string | null; item_id: string | null; title: string; body: string | null; post_type: string; user_id: string; created_at: string; updated_at: string; edited_by: string | null };
        Insert: { id?: string; subject_id?: string | null; item_id?: string | null; title: string; body?: string | null; post_type?: string; user_id: string; created_at?: string; updated_at?: string; edited_by?: string | null };
        Update: { id?: string; subject_id?: string | null; item_id?: string | null; title?: string; body?: string | null; post_type?: string; user_id?: string; created_at?: string; updated_at?: string; edited_by?: string | null };
      };
      forum_comments: {
        Row: { id: string; post_id: string; body: string; user_id: string; created_at: string; updated_at: string };
        Insert: { id?: string; post_id: string; body: string; user_id: string; created_at?: string; updated_at?: string };
        Update: { id?: string; post_id?: string; body?: string; user_id?: string; created_at?: string; updated_at?: string };
      };
      reminder_preferences: {
        Row: { user_id: string; enabled: boolean; schedule_days: number[]; pending_enabled: boolean | null; pending_schedule: number[] | null; concluded_enabled: boolean | null; concluded_schedule: number[] | null; created_at: string; updated_at: string };
        Insert: { user_id: string; enabled?: boolean; schedule_days?: number[]; pending_enabled?: boolean | null; pending_schedule?: number[] | null; concluded_enabled?: boolean | null; concluded_schedule?: number[] | null; created_at?: string; updated_at?: string };
        Update: { user_id?: string; enabled?: boolean; schedule_days?: number[]; pending_enabled?: boolean | null; pending_schedule?: number[] | null; concluded_enabled?: boolean | null; concluded_schedule?: number[] | null; created_at?: string; updated_at?: string };
      };
      notifications: {
        Row: { id: string; user_id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string; };
        Insert: { id?: string; user_id: string; type: string; title: string; body?: string | null; link?: string | null; is_read?: boolean; created_at?: string; };
        Update: { id?: string; user_id?: string; type?: string; title?: string; body?: string | null; link?: string | null; is_read?: boolean; created_at?: string; };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
