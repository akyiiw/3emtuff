import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://3emtuff.vercel.app";

export const getAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

function formatDateBr(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export async function GET(req: NextRequest) {
  console.log("=== INICIANDO ENVIO DE RESUMO ESTILO NOTIFY ===");

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_SERVER_PORT) || 587,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { data: prefs } = await supabase.from("reminder_preferences").select("*");
    const { data: profiles } = await supabase.from("profiles").select("id, name, display_name, email");
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    
    let emailsSentCount = 0;

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      if (!profile?.email) continue;

      const agendaAgrupada: Record<string, { text: string; status: string; color: string; bg: string; link?: string }[]> = {};

      // --- 1. BUSCAR CONCLUÍDOS ---
      if (pref.concluded_enabled) {
        const targetDatesDone = (pref.concluded_schedule || []).map((days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + Number(days));
          return d.toISOString().split("T")[0];
        });

        const { data: doneTasks } = await supabase
          .from("task_done")
          .select(`item_id, done_at, items ( text )`)
          .in("done_at_date_only", targetDatesDone);

        doneTasks?.forEach(task => {
          if (!task.done_at || !task.items) return;
          const date = task.done_at.split("T")[0];
          if (!agendaAgrupada[date]) agendaAgrupada[date] = [];
          agendaAgrupada[date].push({ 
            text: (task.items as any).text, 
            status: "Concluída",
            color: "#10b981",
            bg: "#ecfdf5",
            link: "/atividades" // Link padrão ou específico se tiver
          });
        });
      }

      // --- 2. BUSCAR PENDENTES ---
      if (pref.pending_enabled) {
        const targetDatesPending = (pref.pending_schedule || []).map((days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + Number(days));
          return d.toISOString().split("T")[0];
        });

        const { data: items } = await supabase
          .from("items")
          .select("id, text, due_date")
          .in("due_date", targetDatesPending);

        const { data: userDone } = await supabase.from("task_done").select("item_id").eq("user_id", pref.user_id);
        const doneIds = new Set(userDone?.map(d => d.item_id));

        items?.forEach(item => {
          if (doneIds.has(item.id)) return;
          if (!agendaAgrupada[item.due_date]) agendaAgrupada[item.due_date] = [];
          agendaAgrupada[item.due_date].push({ 
            text: item.text, 
            status: "Pendente",
            color: "#6b7280", // Cinza como no label original
            bg: "#f3f4f6",
            link: "/atividades"
          });
        });
      }

      // --- 3. MONTAGEM DO HTML ESTILO NOTIFY-SEND ---
      const datasOrdenadas = Object.keys(agendaAgrupada).sort();

      if (datasOrdenadas.length > 0) {
        let agendaHtml = "";
        
        for (const data of datasOrdenadas) {
          const isToday = data === today.toISOString().split("T")[0];
          const dateLabel = isToday ? "Hoje" : formatDateBr(data);
          let rows = "";

          agendaAgrupada[data].forEach(task => {
            rows += `
              <tr>
                <td style="padding: 8px 0; vertical-align: top; width: 80px;">
                  <span style="display: inline-block; padding: 2px 8px; background: ${task.bg}; border-radius: 4px; font-size: 11px; color: ${task.color}; font-weight: 600;">
                    ${task.status}
                  </span>
                </td>
                <td style="padding: 8px 0;">
                  <div style="font-size: 14px; color: #18181b; font-weight: 500;">${task.text}</div>
                  <a href="${BASE_URL}${task.link}" style="font-size: 12px; color: #6366f1; text-decoration: none;">Ver detalhes &rarr;</a>
                </td>
                <td style="padding: 8px 0; white-space: nowrap; font-size: 12px; color: #9ca3af; text-align: right; vertical-align: top;">
                  ${dateLabel}
                </td>
              </tr>`;
          });

          agendaHtml += `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              ${rows}
            </table>`;
        }

        const emailHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
            <h2 style="margin-top: 0; color: #18181b; font-size: 20px; text-align: center;">
              Bom dia, ${profile.display_name || profile.name}!
            </h2>
            <p style="color: #3f3f46; text-align: center; margin-bottom: 24px;">
              Aqui está o resumo das suas atividades no 3emtuff:
            </p>

            ${agendaHtml}

            <div style="text-align: center; margin-top: 24px; border-top: 1px solid #f4f4f5; padding-top: 24px;">
              <a href="${BASE_URL}"
                 style="display: inline-block; padding: 10px 24px; background: #18181b; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                Abrir Painel Completo
              </a>
            </div>
            <p style="color: #a1a1aa; font-size: 12px; margin-top: 24px; text-align: center;">
              Este é um lembrete automático baseado nas suas preferências.
            </p>
          </div>`;

        try {
          await transporter.sendMail({
            from: `3emtuff <${process.env.GMAIL_USER}>`,
            to: profile.email,
            subject: `[3emtuff] Resumo de Atividades`,
            html: emailHtml,
          });
          emailsSentCount++;
          await new Promise(r => setTimeout(r, 400));
        } catch (e) {
          console.error(`Erro:`, e);
        }
      }
    }

    return NextResponse.json({ success: true, emailsSent: emailsSentCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}