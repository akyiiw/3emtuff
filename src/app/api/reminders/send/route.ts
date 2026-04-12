import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CRON_SECRET = process.env.CRON_SECRET;

export const getAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
};

// Auxiliar para formatar a data por extenso
function formatDateBr(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}

export async function GET(req: NextRequest) {
  console.log("=== INICIANDO ENVIO DE RESUMO DIÁRIO ===");

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

      // --- ESTRUTURA PARA AGRUPAR POR DATA ---
      // Formato: { "2026-04-12": [ {text: "Tarefa", status: "Pendente"}, ... ] }
      const agendaAgrupada: Record<string, { text: string; status: string }[]> = {};

      // 1. Buscar Concluídos
      const { data: doneTasks } = await supabase
        .from("task_done")
        .select(`item_id, done_at, items ( text )`)
        .eq("user_id", pref.user_id);

      const doneItemIds = new Set(doneTasks?.map(t => t.item_id) || []);

      if (pref.concluded_enabled && doneTasks) {
        doneTasks.forEach(task => {
          if (!task.done_at || !task.items) return;
          const date = task.done_at.split("T")[0];
          if (!agendaAgrupada[date]) agendaAgrupada[date] = [];
          agendaAgrupada[date].push({ 
            text: (task.items as any).text, 
            status: "✅ Concluída, muito bem!" 
          });
        });
      }

      // 2. Buscar Pendentes
      if (pref.pending_enabled) {
        // Buscamos um range de datas (ex: hoje e os próximos 3 dias)
        const checkDates = [0, 1, 2, 3].map(days => {
          const d = new Date(today);
          d.setDate(d.getDate() + days);
          return d.toISOString().split("T")[0];
        });

        const { data: items } = await supabase
          .from("items")
          .select("id, text, due_date")
          .in("due_date", checkDates)
          .eq("created_by", pref.user_id);

        items?.forEach(item => {
          if (doneItemIds.has(item.id)) return; // Pula se já concluiu
          
          if (!agendaAgrupada[item.due_date]) agendaAgrupada[item.due_date] = [];
          agendaAgrupada[item.due_date].push({ 
            text: item.text, 
            status: "⏳ Pendente, não se esqueça!" 
          });
        });
      }

      // 3. MONTAR O CORPO DO E-MAIL SE HOUVER ATIVIDADES
      const datasOrdenadas = Object.keys(agendaAgrupada).sort();

      if (datasOrdenadas.length > 0) {
        let htmlContent = `<h2>Olá, ${profile.display_name || profile.name}!</h2>`;
        htmlContent += `<p>Aqui está o resumo das suas atividades para os próximos dias:</p>`;

        for (const data of datasOrdenadas) {
          htmlContent += `<div style="margin-bottom: 20px;">`;
          htmlContent += `<h3 style="color: #4a90e2; border-bottom: 1px solid #eee;">${formatDateBr(data)}</h3>`;
          htmlContent += `<ul style="list-style: none; padding: 0;">`;
          
          agendaAgrupada[data].forEach(task => {
            htmlContent += `<li style="margin-bottom: 8px;"><strong>${task.text}</strong> - <small>${task.status}</small></li>`;
          });

          htmlContent += `</ul></div>`;
        }

        htmlContent += `<hr/><p style="font-size: 12px; color: #888;">Enviado por 3emtuff</p>`;

        try {
          await transporter.sendMail({
            from: `3emtuff <${process.env.GMAIL_USER}>`,
            to: profile.email,
            subject: `[3emtuff] Seu resumo de atividades`,
            html: htmlContent
          });
          emailsSentCount++;
          console.log(`Resumo enviado para: ${profile.email}`);
          await new Promise(r => setTimeout(r, 500)); // Delay preventivo
        } catch (e) {
          console.error(`Erro ao enviar resumo para ${profile.email}:`, e);
        }
      }
    }

    return NextResponse.json({ success: true, emailsSent: emailsSentCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}