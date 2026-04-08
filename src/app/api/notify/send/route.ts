import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/send-email";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type NotifRow = Database["public"]["Tables"]["notifications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"] & { email: string | null };

const GMAIL_USER = process.env.GMAIL_USER;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://3emtuff.vercel.app";

const TYPE_LABELS: Record<string, string> = {
  new_item: "Nova atividade",
  new_exam: "Nova prova",
  new_forum_post: "Novo post no fórum",
  new_forum_comment: "Novo comentário no fórum",
  item_overdue: "Atividade atrasada",
  item_done: "Tarefa concluída",
};

// Recebe webhook do Supabase com INSERT em notifications
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Supabase webhook envia { record: { user_id, type, title, body, link, ... } }
  const record = body.record ?? body;

  if (!record?.user_id) {
    return NextResponse.json({ error: "No user_id in record" }, { status: 400 });
  }

  if (!GMAIL_USER) {
    return NextResponse.json({ error: "GMAIL_USER not configured" }, { status: 500 });
  }

  try {
    const supabase = getAdminClient();
    const userId = record.user_id as string;

    // Pegar email do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, display_name, email")
      .eq("id", userId)
      .single() as { data: ProfileRow | null };

    if (!profile) return NextResponse.json({ skipped: "User not found" });
    if (!profile.email) return NextResponse.json({ skipped: "User has no email" });

    // Pegar notificações recentes pra enviar todas de uma vez (batch)
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: notifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("is_read", false)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .returns<NotifRow[]>();

    if (!notifs || notifs.length === 0) {
      return NextResponse.json({ skipped: "No unread notifications" });
    }

    const displayName = profile.display_name || profile.name || profile.email.split("@")[0];

    let notifRows = "";
    for (const n of notifs) {
      const label = TYPE_LABELS[n.type] ?? "Novidade";
      const time = n.link
        ? `<a href="${BASE_URL}${n.link}" style="color: #a5b4fc;">${new Date(n.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</a>`
        : new Date(n.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

      notifRows += `
        <tr>
          <td style="padding: 8px 0 8px 0; vertical-align: top;">
            <span style="display: inline-block; padding: 2px 8px; background: #f3f4f6; border-radius: 4px; font-size: 11px; color: #6b7280; margin-right: 8px;">${label}</span>
          </td>
          <td style="padding: 8px 0;">
            <div style="font-size: 14px; color: #18181b; font-weight: 500;">${n.title}</div>
            ${n.link ? `<a href="${BASE_URL}${n.link}" style="font-size: 12px; color: #6366f1; text-decoration: none;">Ver detalhes &rarr;</a>` : ""}
          </td>
          <td style="padding: 8px 0; white-space: nowrap; font-size: 12px; color: #9ca3af; text-align: right; vertical-align: top;">
            ${time}
          </td>
        </tr>`;
    }

    const emailHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px;">
        <h2 style="margin-top: 0; color: #18181b; font-size: 20px;">
          Você tem ${notifs.length} notificaç${notifs.length > 1 ? "ões" : "ão"} pendente${notifs.length > 1 ? "s" : ""}
        </h2>
        <p style="color: #3f3f46;">Olá, <strong>${displayName}</strong>! Aqui está o resumo recente do 3emtuff:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          ${notifRows}
        </table>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${BASE_URL}"
             style="display: inline-block; padding: 10px 24px; background: #18181b; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Ver todas no 3emtuff
          </a>
        </div>
        <p style="color: #a1a1aa; font-size: 12px; margin-top: 24px; text-align: center;">
          Você está recebendo este e-mail porque tem notificações pendentes no 3emtuff.
        </p>
      </div>`;

    await sendEmail({
      to: profile.email,
      subject: `[3emtuff] ${notifs.length} notificaç${notifs.length > 1 ? "ões" : "ão"} pendente${notifs.length > 1 ? "s" : ""}`,
      html: emailHtml,
    });

    return NextResponse.json({ sent: notifs.length, to: profile.email });
  } catch (err) {
    console.error("Notify error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
