"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export const MODERATOR_USER_ID = "ce5da4cf-1e02-4a9e-a10f-bb52b3f57124";

/**
 * Returns true if the current user is a moderator.
 * Checks both the hardcoded ID and the profile.is_moderator flag.
 */
export function useModerator(userId: string | null): boolean {
  const [isMod, setIsMod] = useState(false);

  const checkMod = useCallback(async () => {
    if (!userId) { setIsMod(false); return; }
    if (userId === MODERATOR_USER_ID) { setIsMod(true); return; }
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("is_moderator")
        .eq("id", userId)
        .single();
      setIsMod(!!data?.is_moderator);
    } catch {
      setIsMod(false);
    }
  }, [userId]);

  useEffect(() => { checkMod(); }, [checkMod]);

  return isMod;
}
