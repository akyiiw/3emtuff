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

function formatDateBr(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}

export async function GET(req: NextRequest) {
  console.log("=== INICIANDO ENVIO DE RESUMO PERSONALIZADO ===");

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

      const agendaAgrupada: Record<string, { text: string; status: string }[]> = {};

      // --- 1. BUSCAR CONCLUÍDOS (BASEADO NA AGENDA DO USUÁRIO) ---
      if (pref.concluded_enabled) {
        const targetDatesDone = (pref.concluded_schedule || []).map((days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + Number(days));
          return d.toISOString().split("T")[0];
        });

        const { data: doneTasks } = await supabase
          .from("task_done")
          .select(`item_id, done_at, items ( text )`)
          .in("done_at_date_only", targetDatesDone); // Assumindo que você filtra pela data

        doneTasks?.forEach(task => {
          if (!task.done_at || !task.items) return;
          const date = task.done_at.split("T")[0];
          if (!agendaAgrupada[date]) agendaAgrupada[date] = [];
          agendaAgrupada[date].push({ 
            text: (task.items as any).text, 
            status: "✅ Concluída" 
          });
        });
      }

      // --- 2. BUSCAR PENDENTES (BASEADO NA AGENDA DO USUÁRIO) ---
      if (pref.pending_enabled) {
        const targetDatesPending = (pref.pending_schedule || []).map((days: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + Number(days));
          return d.toISOString().split("T")[0];
        });

        // Buscamos TODOS os itens nas datas de interesse desse usuário (sem filtro de created_by)
        const { data: items } = await supabase
          .from("items")
          .select("id, text, due_date")
          .in("due_date", targetDatesPending);

        // Precisamos saber o que ESTE usuário já concluiu para não mostrar como pendente
        const { data: userDone } = await supabase
          .from("task_done")
          .select("item_id")
          .eq("user_id", pref.user_id);
        
        const doneIds = new Set(userDone?.map(d => d.item_id));

        items?.forEach(item => {
          if (doneIds.has(item.id)) return;
          
          if (!agendaAgrupada[item.due_date]) agendaAgrupada[item.due_date] = [];
          agendaAgrupada[item.due_date].push({ 
            text: item.text, 
            status: "⏳ Pendente" 
          });
        });
      }

      // --- 3. ENVIO DO E-MAIL ---
      const datasOrdenadas = Object.keys(agendaAgrupada).sort();

      if (datasOrdenadas.length > 0) {
        let htmlContent = `<h2>Bom dia, ${profile.display_name || profile.name}!</h2>`;
        htmlContent += `<p>Aqui está o resumo das atividades coletivas baseado nos seus filtros:</p>`;

        for (const data of datasOrdenadas) {
          htmlContent += `<div style="margin-bottom: 20px;">`;
          htmlContent += `<h3 style="color: #4a90e2; border-bottom: 1px solid #eee;">${formatDateBr(data)}</h3>`;
          htmlContent += `<ul style="list-style: none; padding: 0;">`;
          agendaAgrupada[data].forEach(task => {
            htmlContent += `<li style="margin-bottom: 8px;"><strong>${task.text}</strong> - <small>${task.status}</small></li>`;
          });
          htmlContent += `</ul></div>`;
        }

        try {
          await transporter.sendMail({
            from: `3emtuff <${process.env.GMAIL_USER}>`,
            to: profile.email,
            subject: `[3emtuff] Resumo do dia: ${formatDateBr(today.toISOString().split("T")[0])}`,
            html: htmlContent
          });
          emailsSentCount++;
          console.log(`Resumo enviado: ${profile.email}`);
          await new Promise(r => setTimeout(r, 400));
        } catch (e) {
          console.error(`Erro no e-mail de ${profile.email}:`, e);
        }
      }
    }

    return NextResponse.json({ success: true, emailsSent: emailsSentCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}