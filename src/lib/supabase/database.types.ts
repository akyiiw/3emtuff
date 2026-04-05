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
        Row: { id: string; name: string; created_at: string; updated_at: string };
        Insert: { id: string; name: string; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; created_at?: string; updated_at?: string };
      };
      items: {
        Row: { id: string; subject_id: string; text: string; description: string | null; due_date: string | null; created_by: string; created_at: string };
        Insert: { id?: string; subject_id: string; text: string; description?: string | null; due_date?: string | null; created_by: string; created_at?: string };
        Update: { id?: string; subject_id?: string; text?: string; description?: string | null; due_date?: string | null; created_by?: string; created_at?: string };
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
