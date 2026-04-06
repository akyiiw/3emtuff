import { getAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import type { Database } from "@/lib/supabase/database.types";

type NotifRow = Database["public"]["Tables"]["notifications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"] & { email: string | null };

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://3emtuff.vercel.app";
const FROM_EMAIL = "3emtuff <onboarding@resend.dev>";

const TYPE_LABELS: Record<string, string> = {
  new_item: "Nova atividade",
  new_exam: "Nova prova",
  new_forum_post: "Novo post no fórum",
  new_forum_comment: "Novo comentário no fórum",
  item_overdue: "Atividade atrasada",
};

// Rate limit in-memory
const lastSent = new Map<string, number>();

export async function sendNotificationEmails() {
  if (!RESEND_API_KEY) {
    console.error("[notify-email] RESEND_API_KEY not configured");
    return 0;
  }

  try {
    const supabase = getAdminClient();
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, display_name, email")
      .returns<ProfileRow[]>();

    if (!profiles || profiles.length === 0) return 0;

    const resend = new Resend(RESEND_API_KEY);
    let totalSent = 0;

    for (const user of profiles) {
      if (!user.email) continue;
      const last = lastSent.get(user.id);
      if (last && Date.now() - last < 2 * 60 * 1000) continue; // 2 min cooldown

      const { data: notifs } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(10)
        .returns<NotifRow[]>();

      if (!notifs || notifs.length === 0) continue;

      const displayName = user.display_name || user.name || user.email.split("@")[0];

      let notifRows = "";
      for (const n of notifs) {
        const label = TYPE_LABELS[n.type] ?? "Novidade";
        const time = new Date(n.created_at).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        notifRows += `
          <tr>
            <td style="padding: 8px 0 8px 0; vertical-align: top;">
              <span style="display:inline-block;padding:2px 8px;background:#f3f4f6;border-radius:4px;font-size:11px;color:#6b7280;margin-right:8px;">${label}</span>
            </td>
            <td style="padding: 8px 0;">
              <div style="font-size:14px;color:#18181b;font-weight:500;">${n.title}</div>
              ${n.link ? `<a href="${BASE_URL}${n.link}" style="font-size:12px;color:#6366f1;text-decoration:none;">Ver detalhes &rarr;</a>` : ""}
            </td>
            <td style="padding:8px 0;white-space:nowrap;font-size:12px;color:#9ca3af;text-align:right;vertical-align:top;">${time}</td>
          </tr>`;
      }

      const emailHtml = `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;">
          <h2 style="margin-top:0;color:#18181b;font-size:20px;">Você tem ${notifs.length} notificaç${notifs.length > 1 ? "ões" : "ão"} pendente${notifs.length > 1 ? "s" : ""}</h2>
          <p style="color:#3f3f46;">Olá, <strong>${displayName}</strong>! Resumo recente do 3emtuff:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">${notifRows}</table>
          <div style="text-align:center;margin-top:24px;">
            <a href="${BASE_URL}" style="display:inline-block;padding:10px 24px;background:#18181b;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver no 3emtuff</a>
          </div>
        </div>`;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: `[3emtuff] ${notifs.length} notificaç${notifs.length > 1 ? "ões" : "ão"} pendente${notifs.length > 1 ? "s" : ""}`,
        html: emailHtml,
      });

      lastSent.set(user.id, Date.now());
      totalSent++;
    }

    return totalSent;
  } catch (err) {
    console.error("[notify-email] Error:", err);
    return 0;
  }
}
