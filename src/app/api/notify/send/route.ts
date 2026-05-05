import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/send-email"; // Certifique-se que este arquivo usa OAuth2 agora
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type NotifRow = Database["public"]["Tables"]["notifications"]["Row"] & {
  item_id?: string | null;
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://3emtuff.vercel.app";

const TYPE_LABELS: Record<string, string> = {
  new_item: "Nova atividade",
  new_exam: "Nova prova",
  new_forum_post: "Novo post no fórum",
  new_forum_comment: "Novo comentário no fórum",
  item_overdue: "Atividade atrasada",
};

export async function POST(req: NextRequest) {
  console.log("[notify-send] Webhook iniciado via OAuth2");

  // 1. Validação de Segurança
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const authHeader = req.headers.get("authorization") || req.headers.get("x-webhook-secret");

  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}` && authHeader !== webhookSecret) {
    console.error("[notify-send] Secret inválido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const record = body.record ?? body;
    const userId = record.user_id as string;

    if (!userId) return NextResponse.json({ error: "user_id ausente" }, { status: 400 });

    const supabase = getAdminClient();

    // 2. Buscar Dados do Usuário
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authUser?.user?.email) {
      return NextResponse.json({ skipped: "Usuário sem e-mail" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, display_name")
      .eq("id", userId)
      .single<Database["public"]["Tables"]["profiles"]["Row"]>();

    const email = authUser.user.email;
    const displayName = profile?.display_name || profile?.name || email.split("@")[0];

    // 3. Buscar Notificações Recentes (Últimas 2 horas)
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: allNotifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("is_read", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .returns<NotifRow[]>();

    if (!allNotifs || allNotifs.length === 0) {
      return NextResponse.json({ skipped: "Sem notificações não lidas" });
    }

    // 4. Filtro de Tarefas Concluídas
    const { data: doneTasks } = await supabase
      .from("task_done")
      .select("item_id")
      .eq("user_id", userId)
      .returns<{ item_id: string }[]>();

    const doneIds = new Set(doneTasks?.map(d => d.item_id) || []);

    const filteredNotifs = allNotifs.filter(n => {
      if (n.type === "item_done") return false;
      if (n.item_id && doneIds.has(n.item_id)) return false;
      return true;
    });

    if (filteredNotifs.length === 0) {
      return NextResponse.json({ skipped: "Todas as tarefas concluídas" });
    }

    // 5. Construção do HTML (Mantida sua lógica visual)
    let notifRows = "";
    for (const n of filteredNotifs) {
      const label = TYPE_LABELS[n.type] ?? "Novidade";
      const timeStr = new Date(n.created_at).toLocaleString("pt-BR", { 
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" 
      });

      notifRows += `
        <tr>
          <td style="padding: 10px 0; vertical-align: top; width: 100px;">
            <span style="display: inline-block; padding: 2px 8px; background: #f3f4f6; border-radius: 4px; font-size: 11px; color: #6b7280; font-weight: 600;">
              ${label}
            </span>
          </td>
          <td style="padding: 10px 0;">
            <div style="font-size: 14px; color: #18181b; font-weight: 500; line-height: 1.4;">${n.title}</div>
            ${n.link ? `<a href="${BASE_URL}${n.link}" style="font-size: 12px; color: #6366f1; text-decoration: none;">Ver detalhes &rarr;</a>` : ""}
          </td>
          <td style="padding: 10px 0; white-space: nowrap; font-size: 12px; color: #9ca3af; text-align: right; vertical-align: top;">
            ${timeStr}
          </td>
        </tr>`;
    }

    const emailHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
        <h2 style="margin-top: 0; color: #18181b; font-size: 20px;">
          Você tem ${filteredNotifs.length} nova${filteredNotifs.length > 1 ? "s" : ""} pendênci${filteredNotifs.length > 1 ? "as" : "a"}
        </h2>
        <p style="color: #3f3f46;">Olá, <strong>${displayName}</strong>!</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          ${notifRows}
        </table>
        <div style="text-align: center; margin-top: 24px; border-top: 1px solid #f4f4f5; padding-top: 24px;">
          <a href="${BASE_URL}" style="display: inline-block; padding: 10px 24px; background: #18181b; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Ver tudo no site
          </a>
        </div>
      </div>`;

    // 6. Enviar E-mail (Agora usando a lib atualizada com OAuth2)
    await sendEmail({
      to: email,
      subject: `[3emtuff] ${filteredNotifs.length} nova${filteredNotifs.length > 1 ? "s" : ""} pendênci${filteredNotifs.length > 1 ? "as" : "a"}`,
      html: emailHtml,
    });

    return NextResponse.json({ sent: filteredNotifs.length, to: email });

  } catch (err) {
    console.error("[notify-send] Erro fatal:", err);
    console.log("--- DEBUG OAUTH ---");
    console.log("User:", process.env.GMAIL_USER);
    console.log("Client ID existe?:", !!process.env.GOOGLE_CLIENT_ID);
    console.log("Secret existe?:", !!process.env.GOOGLE_SECRET_KEY);
    console.log("Refresh Token existe?:", !!process.env.REFRESH_TOKEN);
    console.log("-------------------");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}