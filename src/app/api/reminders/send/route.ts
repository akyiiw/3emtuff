import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendEmail } from "@/lib/send-email";

const CRON_SECRET = process.env.CRON_SECRET;

const FROM_EMAIL = process.env.GMAIL_USER ? `3emtuff <${process.env.GMAIL_USER}>` : "3emtuff <no-reply@3emtuff.com>";

/** Build a deduped list of target date strings from a schedule_days array */
function buildTargetDates(today: Date, scheduleDays: number[]): string[] {
  const dates = new Set<string>();
  for (const daysBefore of scheduleDays) {
    const d = new Date(today);
    if (daysBefore === 0) {
      dates.add(d.toISOString().split("T")[0]);
    } else {
      d.setDate(d.getDate() + daysBefore);
      dates.add(d.toISOString().split("T")[0]);
    }
  }
  return [...dates];
}

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
  const todayStr = today.toISOString().split("T")[0];

  try {
    // Fetch all preferences and profiles
    const { data: prefs } = await supabase
      .from("reminder_preferences")
      .select("*")
      .returns<Database["public"]["Tables"]["reminder_preferences"]["Row"][]>();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, display_name, email")
      .returns<Database["public"]["Tables"]["profiles"]["Row"][]>();
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

    let totalSent = 0;

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      const userEmail = profile?.email;
      if (!userEmail) continue;

      const displayName = profile?.display_name || profile?.name || userEmail.split("@")[0];

      // --- PENDING reminders ---
      const pendingEnabled = pref.pending_enabled ?? pref.enabled ?? true;
      const pendingSchedule = (pref.pending_schedule ?? pref.schedule_days) ?? [0, 1, 2];

      if (pendingEnabled && pendingSchedule.length > 0) {
        const targetDates = buildTargetDates(today, pendingSchedule);

        const { data: userItems } = await supabase
          .from("items")
          .select("*")
          .in("due_date", targetDates)
          .eq("created_by", pref.user_id)
          .returns<Database["public"]["Tables"]["items"]["Row"][]>();

        const items = userItems ?? [];
        if (items.length > 0) {
          for (const item of items) {
            const dueDate = item.due_date;
            if (!dueDate) continue;
            const diffDays = Math.floor(
              (new Date(dueDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );

            const timeLabel =
              diffDays === 0 ? "hoje" : diffDays === 1 ? "amanhã" : `em ${diffDays} dias`;
            const typeLabel =
              item.item_type === "exam" ? "Prova" : item.item_type === "work" ? "Trabalho" : item.item_type === "presentation" ? "Apresentação" : "Atividade";
            const dueFormatted = new Date(dueDate + "T00:00:00").toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
            });

            await resend.emails.send({
              from: FROM_EMAIL,
              to: userEmail,
              subject: `[3emtuff] Pendente: ${item.text}`,
              html: `
                <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                  <h2 style="margin-top: 0; color: #18181b;">⏳ Atividade pendente</h2>
                  <p style="color: #3f3f46;">Olá, <strong>${displayName}</strong>!</p>
                  <p style="color: #3f3f46;">Você tem uma <strong>${typeLabel}</strong> ${timeLabel}:</p>
                  <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">${item.text}</p>
                    <p style="margin: 8px 0 0; color: #92400e;">${dueFormatted}</p>
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
      }

      // --- CONCLUDED reminders ---
      const concludedEnabled = pref.concluded_enabled ?? pref.enabled ?? true;
      const concludedSchedule = pref.concluded_schedule ?? [0, 1, 2];

      if (concludedEnabled && concludedSchedule.length > 0) {
        // Get items where the user has marked tasks as done
        const { data: doneEntries } = await supabase
          .from("task_done")
          .select("*")
          .eq("user_id", pref.user_id)
          .returns<{ item_id: string; done_at: string }[]>();

        if (doneEntries && doneEntries.length > 0) {
          const doneItemIds = doneEntries.map((d) => d.item_id);
          const doneMap = new Map<string, string>();
          for (const d of doneEntries) {
            doneMap.set(d.item_id, d.done_at);
          }

          const { data: concludedItems } = await supabase
            .from("items")
            .select("*")
            .in("id", doneItemIds)
            .in("due_date", buildTargetDates(today, concludedSchedule))
            .returns<Database["public"]["Tables"]["items"]["Row"][]>();

          for (const item of (concludedItems ?? [])) {
            const dueDate = item.due_date;
            if (!dueDate) continue;
            const diffDays = Math.floor(
              (new Date(dueDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
            const timeLabel =
              diffDays === 0 ? "hoje" : diffDays === 1 ? "amanhã" : `em ${diffDays} dias`;
            const typeLabel =
              item.item_type === "exam" ? "Prova" : item.item_type === "work" ? "Trabalho" : item.item_type === "presentation" ? "Apresentação" : "Atividade";
            const dueFormatted = new Date(dueDate + "T00:00:00").toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
            });

            await resend.emails.send({
              from: FROM_EMAIL,
              to: userEmail,
              subject: `[3emtuff] Concluída: ${item.text}`,
              html: `
                <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                  <h2 style="margin-top: 0; color: #18181b;">✅ Atividade concluída</h2>
                  <p style="color: #3f3f46;">Olá, <strong>${displayName}</strong>!</p>
                  <p style="color: #3f3f46;">Você concluiu esta <strong>${typeLabel}</strong> que é ${timeLabel}:</p>
                  <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #18181b;">${item.text}</p>
                    <p style="margin: 8px 0 0; color: #166534;">${dueFormatted} ✓</p>
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
      }
    }

    return NextResponse.json({ sent: totalSent });
  } catch (err) {
    console.error("Reminder error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
