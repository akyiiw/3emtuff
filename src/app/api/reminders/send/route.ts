import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { getSubject } from "@/lib/subjects";

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

function formatDateSimple(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

export async function GET(req: NextRequest) {
  console.log("=== [Cron Reminders] Iniciando processo de envio ===");

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
    console.error("[Cron Reminders] Erro: Não autorizado. Secret inválido.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[Cron Reminders] Autorização bem sucedida");

  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { data: prefs } = await supabase.from("reminder_preferences").select("*");
    const { data: profiles } = await supabase.from("profiles").select("id, name, display_name, email");
    console.log(`[Cron Reminders] Total de preferências: ${prefs?.length ?? 0}, Perfis: ${profiles?.length ?? 0}`);
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    
    let emailsSentCount = 0;

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      if (!profile?.email) continue;

      console.log(`[Cron Reminders] Processando usuário ${profile.email} (Concluded: ${pref.concluded_enabled}, Pending: ${pref.pending_enabled})`);

      const agendaAgrupada: Record<string, { text: string; status: string; color: string; bg: string; link?: string; timestamp: number }[]> = {};

      // --- 1. BUSCAR CONCLUÍDOS (APENAS DESTE USUÁRIO) ---
      if (pref.concluded_enabled) {
        const targetDatesDone = (pref.concluded_schedule || []).map((days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + Number(days));
          return d.toISOString().split("T")[0];
        });

        const { data: doneTasks } = await supabase
          .from("task_done")
          .select(`item_id, done_at, items ( text, subject_id )`)
          .eq("user_id", pref.user_id) // MUDANÇA CRUCIAL: Filtra para mostrar apenas o que EU fiz
          .in("done_at_date_only", targetDatesDone);

        console.log(`[Cron Reminders] Concluídos para ${profile.email}: ${doneTasks?.length ?? 0} itens (Datas: ${targetDatesDone.join(", ")})`);

        if (doneTasks) {
          for (const task of doneTasks) {
            try {
              if (!task.done_at || !task.items) continue;
              const date = task.done_at.split("T")[0];
              if (!agendaAgrupada[date]) agendaAgrupada[date] = [];

              const itemData = Array.isArray(task.items) ? task.items[0] : task.items;
              const subj = getSubject(itemData?.subject_id);
              const emoji = subj?.emoji ?? "📚";
              const text = itemData?.text ?? "Atividade";

              // Identificação do tipo (se disponível no itemData)
              const typeLabel = (itemData as any)?.type === "exam" ? "Prova" : (itemData as any)?.type === "work" ? "Trabalho" : (itemData as any)?.type === "presentation" ? "Apresentação" : "Atividade";

              agendaAgrupada[date].push({
                text: `${emoji} [${typeLabel}] ${text}`,
                status: "Concluída",
                color: "#10b981",
                bg: "#ecfdf5",
                link: `/dashboard/${itemData?.subject_id}?item=${task.item_id}`,
                timestamp: new Date(task.done_at).getTime()
              });
            } catch (e) {
              console.error("Erro ao processar task concluída:", e);
            }
          }
        }
      }

      // --- 2. BUSCAR PENDENTES (COLETIVO, MAS FILTRANDO O QUE O USER JÁ FEZ) ---
      if (pref.pending_enabled) {
        const targetDatesPending = (pref.pending_schedule || []).map((days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + Number(days));
          return d.toISOString().split("T")[0];
        });

        const { data: items, error: itemsError } = await supabase
          .from("items")
          .select("id, text, due_date, created_at, subject_id")
          .in("due_date", targetDatesPending);

        if (itemsError) {
          console.error(`[Cron Reminders] Erro ao buscar itens para ${profile.email}:`, itemsError);
        }

        console.log(`[Cron Reminders] Pendentes para ${profile.email}: ${items?.length ?? 0} itens (Datas: ${targetDatesPending.join(", ")})`);

        const { data: userDone } = await supabase.from("task_done").select("item_id").eq("user_id", pref.user_id);
        const doneIds = new Set(userDone?.map(d => d.item_id));

        if (items) {
          for (const item of items) {
            try {
              const isDone = doneIds.has(item.id);
              if (!agendaAgrupada[item.due_date]) agendaAgrupada[item.due_date] = [];

              const subj = getSubject(item.subject_id);
              const emoji = subj?.emoji ?? "📚";
              // Usamos "Atividade" como default pois a coluna 'type' causou erro na query
              const typeLabel = "Atividade";

              agendaAgrupada[item.due_date].push({
                text: `${emoji} [${typeLabel}] ${item.text}`,
                status: isDone ? "Concluída" : "Pendente",
                color: isDone ? "#10b981" : "#6b7280",
                bg: isDone ? "#ecfdf5" : "#f3f4f6",
                link: `/dashboard/${item.subject_id}?item=${item.id}`,
                timestamp: new Date(item.created_at).getTime()
              });
            } catch (e) {
              console.error("Erro ao processar item pendente:", e);
            }
          }
        }
      }

      // --- 3. MONTAGEM DO HTML COM ORDEM INVERSA ---
      const datasOrdenadas = Object.keys(agendaAgrupada).sort();

      if (datasOrdenadas.length === 0) {
        console.log(`[Cron Reminders] Agenda vazia para ${profile.email}`);
      }

      if (datasOrdenadas.length > 0) {
        let agendaHtml = "";
        
        for (const data of datasOrdenadas) {
          const todayStr = today.toISOString().split("T")[0];
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split("T")[0];
          const dayAfter = new Date(today);
          dayAfter.setDate(dayAfter.getDate() + 2);
          const dayAfterStr = dayAfter.toISOString().split("T")[0];

          const simpleDate = formatDateSimple(data);
          let dateLabel = `${formatDateBr(data)} (${simpleDate})`;
          if (data === todayStr) dateLabel = `Hoje (${simpleDate})`;
          else if (data === tomorrowStr) dateLabel = `Amanhã (${simpleDate})`;
          else if (data === dayAfterStr) dateLabel = `Depois de Amanhã (${simpleDate})`;

          const isToday = data === todayStr;

          // Inverter a ordem dos itens dentro de cada dia (mais recentes primeiro)
          const itensOrdenados = agendaAgrupada[data].sort((a, b) => b.timestamp - a.timestamp);

          let rows = "";
          itensOrdenados.forEach(task => {
            rows += `<tr><td style="padding:10px 0;vertical-align:top;width:100px;"><span style="display:inline-block;padding:2px 8px;background:${task.bg};border-radius:4px;font-size:11px;color:${task.color};font-weight:600;">${task.status}</span></td><td style="padding:10px 0;"><div style="font-size:14px;color:#18181b;font-weight:500;">${task.text}</div><a href="${BASE_URL}${task.link}" style="font-size:12px;color:#6366f1;text-decoration:none;">Ver detalhes &rarr;</a></td></tr>`;
          });

          agendaHtml += `<div style="margin-top:24px;margin-bottom:12px;"><div style="font-size:12px;font-weight:700;color:${isToday ? '#ef4444' : '#71717a'};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${dateLabel}</div><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`;
        }

        const emailHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
            <h2 style="margin-top: 0; color: #18181b; font-size: 20px; text-align: left;">
              Bom dia, ${profile.display_name || profile.name}!
            </h2>
            <p style="color: #3f3f46; text-align: left; margin-bottom: 24px;">
              Aqui está seu resumo de atividades no 3emtuff:
            </p>

            ${agendaHtml}

            <div style="text-align: center; margin-top: 24px; border-top: 1px solid #f4f4f5; padding-top: 24px;">
              <a href="${BASE_URL}"
                 style="display: inline-block; padding: 10px 24px; background: #18181b; color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                Abrir Painel Completo
              </a>
            </div>
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

    console.log(`=== [Cron Reminders] Processo finalizado. E-mails enviados: ${emailsSentCount} ===`);
    return NextResponse.json({ success: true, emailsSent: emailsSentCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}