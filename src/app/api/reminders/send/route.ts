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
    month: "long",
  });
}

export async function GET(req: NextRequest) {
  console.log("=== INICIANDO ENVIO DE RESUMO ESTILIZADO ===");

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

      const agendaAgrupada: Record<string, { text: string; status: string; color: string; bg: string }[]> = {};

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
            color: "#10b981", // Verde
            bg: "#ecfdf5"
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
            color: "#f59e0b", // Laranja/Amarelo
            bg: "#fffbeb"
          });
        });
      }

      // --- 3. MONTAGEM DO HTML ESTILO "EMBED" ---
      const datasOrdenadas = Object.keys(agendaAgrupada).sort();

      if (datasOrdenadas.length > 0) {
        let agendaHtml = "";
        
        for (const data of datasOrdenadas) {
          let rows = "";
          agendaAgrupada[data].forEach(task => {
            rows += `
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f4f4f5;">
                  <span style="display: inline-block; padding: 2px 8px; background: ${task.bg}; border-radius: 4px; font-size: 11px; color: ${task.color}; font-weight: 600; margin-bottom: 4px;">
                    ${task.status.toUpperCase()}
                  </span>
                  <div style="font-size: 15px; color: #18181b; font-weight: 500;">${task.text}</div>
                </td>
              </tr>`;
          });

          agendaHtml += `
            <div style="margin-top: 24px;">
              <div style="font-size: 13px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
                ${data === today.toISOString().split("T")[0] ? "Hoje" : formatDateBr(data)}
              </div>
              <table style="width: 100%; border-collapse: collapse;">
                ${rows}
              </table>
            </div>`;
        }

        const emailHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
            <h2 style="margin: 0; color: #18181b; font-size: 24px; text-align: center;">
              Bom dia, ${profile.display_name || profile.name}!
            </h2>
            <p style="color: #52525b; text-align: center; font-size: 16px; margin-top: 8px;">
              Aqui está sua agenda para os próximos dias no EPC.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              ${agendaHtml}
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

        try {
          await transporter.sendMail({
            from: `3emtuff <${process.env.GMAIL_USER}>`,
            to: profile.email,
            subject: `Resumo de Atividades - ${formatDateBr(today.toISOString().split("T")[0])}`,
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