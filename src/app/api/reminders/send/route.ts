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

  // 1. Criamos o transporter dentro da função para garantir o acesso às ENVs
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

    console.log(`Iniciando processamento de ${prefs?.length ?? 0} preferências.`);

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      
      if (!profile?.email) {
        console.log(`PULANDO: Usuário ${pref.user_id} não possui email.`);
        continue;
      }

      const userEmail = profile.email;
      const displayName = profile.display_name || profile.name || userEmail.split("@")[0];
      const FROM_EMAIL = `3emtuff <${process.env.GMAIL_USER}>`;

      // --- LOGICA DE PENDENTES ---
      if (pref.pending_enabled) {
        const targetDates = buildTargetDates(today, pref.pending_schedule || []);
        const { data: items } = await supabase
          .from("items")
          .select("text, due_date")
          .in("due_date", targetDates)
          .eq("created_by", pref.user_id); // Importante: filtrar por usuário!

        if (items && items.length > 0) {
          console.log(`Encontrados ${items.length} pendentes para ${userEmail}`);
          for (const item of items) {
            try {
              const dateFormatted = new Date(item.due_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
              
              await transporter.sendMail({
                from: FROM_EMAIL,
                to: userEmail,
                subject: `[3emtuff] Pendente: ${item.text}`,
                html: `<div style="font-family: sans-serif;"><h2>Olá, ${displayName}</h2><p>Atividade pendente: <strong>${item.text}</strong></p><p>Data: ${dateFormatted}</p></div>`
              });
              
              totalSent++;
              console.log(`SUCESSO: E-mail pendente enviado para ${userEmail}`);
              // Pequena pausa para o Gmail não bloquear
              await new Promise(r => setTimeout(r, 300));
            } catch (err) {
              console.error(`ERRO no envio pendente para ${userEmail}:`, err);
            }
          }
        }
      }

      // --- LOGICA DE CONCLUÍDOS ---
      if (pref.concluded_enabled) {
        const targetDates = buildTargetDates(today, pref.concluded_schedule || []);
        const { data: doneTasks } = await supabase
          .from("task_done")
          .select(`done_at, items ( text )`)
          .eq("user_id", pref.user_id);

        if (doneTasks) {
          for (const task of doneTasks) {
            if (!task.done_at || !task.items) continue;
            const doneDate = task.done_at.split("T")[0];
            
            if (targetDates.includes(doneDate)) {
              try {
                const itemText = (task.items as any)?.text || "Tarefa s/ nome";
                const dateFormatted = new Date(doneDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

                await transporter.sendMail({
                  from: FROM_EMAIL,
                  to: userEmail,
                  subject: `[3emtuff] Concluída: ${itemText}`,
                  html: `<div style="font-family: sans-serif;"><h2>Olá, ${displayName}</h2><p>Atividade concluída: <strong>${itemText}</strong></p><p>Data: ${dateFormatted}</p></div>`
                });

                totalSent++;
                console.log(`SUCESSO: E-mail concluído enviado para ${userEmail}`);
                await new Promise(r => setTimeout(r, 300));
              } catch (err) {
                console.error(`ERRO no envio concluído para ${userEmail}:`, err);
              }
            }
          }
        }
      }
    }

    console.log(`=== FIM DO PROCESSO. TOTAL ENVIADO: ${totalSent} ===`);
    return NextResponse.json({ success: true, sent: totalSent });

  } catch (err) {
    console.error("ERRO CRÍTICO NA ROTA:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}