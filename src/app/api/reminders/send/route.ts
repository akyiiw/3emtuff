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

function buildTargetDates(today: Date, scheduleDays: number[]): string[] {
  const dates = new Set<string>();
  for (const daysBefore of scheduleDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + Number(daysBefore));
    const isoDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
    dates.add(isoDate);
  }
  return [...dates];
}

export async function GET(req: NextRequest) {
  console.log("=== ROTA DE LEMBRETES ACESSADA ===");

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
    console.log("BLOQUEADO: Token de autorização inválido ou ausente.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { data: prefs } = await supabase.from("reminder_preferences").select("*");
    const { data: profiles } = await supabase.from("profiles").select("id, name, display_name, email");
    
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    let totalSent = 0;

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      if (!profile?.email) continue;

      const userEmail = profile.email;
      const displayName = profile.display_name || profile.name || userEmail.split("@")[0];
      const FROM_EMAIL = `3emtuff <${process.env.GMAIL_USER}>`;

      console.log(`-----------------------------------------`);
      console.log(`PROCESSANDO: ${userEmail}`);

      // 1. BUSCAR TAREFAS CONCLUÍDAS PRIMEIRO
      const { data: doneTasks } = await supabase
        .from("task_done")
        .select(`item_id, done_at, items ( text )`)
        .eq("user_id", pref.user_id);

      // Criar um Set com os IDs das tarefas concluídas para exclusão mútua
      const doneItemIds = new Set(doneTasks?.map(t => t.item_id) || []);

      // 2. LOGICA DE PENDENTES (Só envia se não estiver no Set de concluídos)
      if (pref.pending_enabled) {
        const targetDates = buildTargetDates(today, pref.pending_schedule || []);
        const { data: items } = await supabase
          .from("items")
          .select("id, text, due_date")
          .in("due_date", targetDates)

        if (items) {
          for (const item of items) {
            // VERIFICAÇÃO: Se já foi concluída, não envia como pendente
            if (doneItemIds.has(item.id)) {
              console.log(`IGNORANDO PENDENTE: "${item.text}" já está concluída.`);
              continue;
            }

            try {
              const dateFmt = new Date(item.due_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
              await transporter.sendMail({
                from: FROM_EMAIL,
                to: userEmail,
                subject: `[3emtuff] Pendente: ${item.text}`,
                html: `<div style="font-family: sans-serif;"><h2>Olá, ${displayName}</h2><p>Lembrete de atividade pendente: <strong>${item.text}</strong></p><p>Data: ${dateFmt}</p></div>`
              });
              totalSent++;
              console.log(`SUCESSO: Pendente enviado -> ${userEmail}`);
              await new Promise(r => setTimeout(r, 400)); // Delay para o Gmail
            } catch (err) {
              console.error(`ERRO Pendente ${userEmail}:`, err);
            }
          }
        }
      }

      // 3. LOGICA DE CONCLUÍDOS
      if (pref.concluded_enabled && doneTasks) {
        const targetDatesConc = buildTargetDates(today, pref.concluded_schedule || []);
        for (const task of doneTasks) {
          if (!task.done_at || !task.items) continue;
          const doneDate = task.done_at.split("T")[0];

          if (targetDatesConc.includes(doneDate)) {
            try {
              const itemText = (task.items as any)?.text || "Tarefa s/ nome";
              const dateFmt = new Date(doneDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

              await transporter.sendMail({
                from: FROM_EMAIL,
                to: userEmail,
                subject: `[3emtuff] Concluída: ${itemText}`,
                html: `<div style="font-family: sans-serif;"><h2>Olá, ${displayName}</h2><p>Atividade concluída: <strong>${itemText}</strong></p><p>Data: ${dateFmt}</p></div>`
              });
              totalSent++;
              console.log(`SUCESSO: Concluída enviada -> ${userEmail}`);
              await new Promise(r => setTimeout(r, 400));
            } catch (err) {
              console.error(`ERRO Concluída ${userEmail}:`, err);
            }
          }
        }
      }
    }

    console.log(`=== FIM DO PROCESSO. TOTAL ENVIADO: ${totalSent} ===`);
    return NextResponse.json({ success: true, sent: totalSent });

  } catch (err) {
    console.error("ERRO CRÍTICO:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}