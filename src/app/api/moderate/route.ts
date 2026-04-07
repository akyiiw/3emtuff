import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { MODERATOR_USER_ID } from "@/lib/use-moderator";

const MOD = MODERATOR_USER_ID;

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table");
  const id = searchParams.get("id");

  if (!table || !id) {
    return NextResponse.json({ error: "Missing table or id" }, { status: 400 });
  }

  if (!["forum_posts", "forum_comments", "items"].includes(table)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  // Verify the caller is a moderator
  const userId = searchParams.get("userId");
  const isModeratorRequest = userId === MOD;

  const adminSupabase = getAdminClient();

  // Check is_moderator flag in profiles (also allow the hardcoded MOD id)
  if (!isModeratorRequest && userId) {
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("is_moderator")
      .eq("id", userId)
      .single();
    if (!profile?.is_moderator) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  if (!isModeratorRequest && !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Admin client bypasses RLS — can delete any row
  const { error } = await adminSupabase.from(table).delete().eq("id", id);
  if (error) {
    console.error(`[moderate] Error deleting from ${table}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
