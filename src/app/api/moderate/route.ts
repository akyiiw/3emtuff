import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { MODERATOR_USER_ID } from "@/lib/use-moderator";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
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
    console.log(`[moderate] Checking moderator status for userId: ${userId}`);
    const result = await adminSupabase
      .from("profiles")
      .select("is_moderator")
      .eq("id", userId)
      .single();

    const profile = result.data as { is_moderator: boolean } | null;
    const profileError = result.error;

    if (profileError) {
      console.error("[moderate] Error fetching profile:", profileError);
      return NextResponse.json({ error: "Auth check failed", details: profileError.message }, { status: 500 });
    }

    console.log(`[moderate] Profile fetched:`, profile);
    if (!profile || profile.is_moderator !== true) {
      console.log(`[moderate] User ${userId} is not a moderator (is_moderator: ${profile?.is_moderator})`);
      return NextResponse.json({ error: "Unauthorized - not a moderator" }, { status: 403 });
    }
    console.log(`[moderate] User ${userId} is a moderator - proceeding with delete`);
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
