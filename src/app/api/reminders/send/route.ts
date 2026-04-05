import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const FROM_EMAIL = "3emtuff <onboarding@resend.dev>";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const resend = new Resend(RESEND_API_KEY);
  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { data: prefs } = await supabase
      .from("reminder_preferences")
      .select("user_id, enabled, days_before")
      .returns<Database["public"]["Tables"]["reminder_preferences"]["Row"][]>();

    const enabledPrefs = (prefs ?? []).filter((p) => p.enabled);

    if (enabledPrefs.length === 0) {
      return NextResponse.json({ sent: 0, message: "No users with reminders enabled" });
    }

    // Get all profiles for display names and emails
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, display_name, email")
      .returns<Database["public"]["Tables"]["profiles"]["Row"][]>();
    const profileMap = new Map();
    for (const p of (profiles ?? [])) {
      profileMap.set(p.id, p);
    }

    let totalSent = 0;

    for (const pref of enabledPrefs) {
      const profile = profileMap.get(pref.user_id);
      const userEmail = profile?.email;
      if (!userEmail) continue;

      const displayName = profile?.display_name || profile?.name || userEmail.split("@")[0];

      // Target dates from today to today + days_before
      const targetDates: string[] = [];
      for (let i = 0; i <= pref.days_before; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        targetDates.push(d.toISOString().split("T")[0]);
      }

      const { data: userItems } = await supabase
        .from("items")
        .select("*")
        .in("due_date", targetDates)
        .eq("created_by", pref.user_id)
        .returns<Database["public"]["Tables"]["items"]["Row"][]>();

      const items = userItems ?? [];
      if (items.length === 0) continue;

      for (const item of items) {
        const dueDate = item.due_date;
        const diffDays = Math.floor(
          (new Date(dueDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        const timeLabel =
          diffDays === 0 ? "hoje" : diffDays === 1 ? "amanhã" : `em ${diffDays} dias`;

        const typeLabel =
          item.item_type === "exam" ? "Prova" : item.item_type === "work" ? "Trabalho" : "Atividade";

        const dueFormatted = new Date(dueDate + "T00:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
        });

        await resend.emails.send({
          from: FROM_EMAIL,
          to: userEmail,
          subject: `[3emtuff] Lembrete: ${item.text}`,
          html: `
            <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="margin-top: 0; color: #18181b;">Lembrete</h2>
              <p style="color: #3f3f46;">Olá, <strong>${displayName}</strong>!</p>
              <p style="color: #3f3f46;">Você tem uma <strong>${typeLabel}</strong> ${timeLabel}:</p>
              <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">${item.text}</p>
                <p style="margin: 8px 0 0; color: #71717a;">${dueFormatted}</p>
              </div>
              ${item.description ? `<p style="color: #52525b; font-size: 14px;">${item.description}</p>` : ""}
              <p style="color: #a1a1aa; font-size: 12px; margin-top: 24px;">
                Você pode desabilitar lembretes nas configurações do 3emtuff.
              </p>
            </div>
          `,
        });

        totalSent++;
      }
    }

    return NextResponse.json({ sent: totalSent });
  } catch (err) {
    console.error("Reminder error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
