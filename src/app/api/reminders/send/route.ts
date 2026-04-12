import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

// --- CONFIGURAÇÃO DE AMBIENTE ---
// Estas linhas forçam a Vercel a rodar o código toda vez (limpa o cache)
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

const FROM_EMAIL = `3emtuff <${process.env.GMAIL_USER}>`;

// Função para gerar as datas alvo (YYYY-MM-DD)
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
  // 1. LOG DE ENTRADA (Para você saber que a rota acordou)
  console.log("=== ROTA DE LEMBRETES ACESSADA ===");

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT) || 587,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  // 2. SEGURANÇA (Padrão Vercel Authorization)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    console.log("BLOQUEADO: Token de autorização inválido ou ausente.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Busca Preferências e Perfis
    const { data: prefs } = await supabase.from("reminder_preferences").select("*");
    const { data: profiles } = await supabase.from("profiles").select("id, name, display_name, email");
    
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    let totalSent = 0;
    const emailPromises: Promise<void>[] = [];

    console.log(`Iniciando processamento de ${prefs?.length ?? 0} preferências.`);

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      
      // --- LOG DETALHADO POR USUÁRIO ---
      console.log("-----------------------------------------");
      console.log(`USUÁRIO: ${profile?.email || 'Sem Email'} (ID: ${pref.user_id})`);
      console.log(`PENDENTES: ${pref.pending_enabled ? 'Ativo' : 'Inativo'} | Agenda: ${pref.pending_schedule}`);
      console.log(`CONCLUÍDOS: ${pref.concluded_enabled ? 'Ativo' : 'Inativo'} | Agenda: ${pref.concluded_schedule}`);

      if (!profile?.email) {
        console.log("PULANDO: Usuário não possui email.");
        continue;
      }

      const userEmail = profile.email;
      const displayName = profile.display_name || profile.name || userEmail.split("@")[0];

      // Função Auxiliar para Enviar Email
      const queueEmail = (title: string, dateStr: string, type: "Pendente" | "Concluída") => {
        const dateFormatted = new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
        });

        emailPromises.push(
          transporter.sendMail({
            from: FROM_EMAIL,
            to: userEmail,
            subject: `[3emtuff] ${type}: ${title}`,
            html: `<div style="font-family: sans-serif;"><h2>Olá, ${displayName}</h2><p>Atividade <strong>${type.toLowerCase()}</strong>: ${title}</p><p>Data: ${dateFormatted}</p></div>`
          }).then(() => { 
            console.log(`SUCESSO: Email de ${type} enviado para ${userEmail}`);
            totalSent++; 
          })
          .catch(err => console.error(`FALHA ao enviar para ${userEmail}:`, err))
        );
      };

      // LÓGICA PENDENTES (Tabela items)
      if (pref.pending_enabled) {
        const targetDates = buildTargetDates(today, pref.pending_schedule || []);
        const { data: items } = await supabase
          .from("items")
          .select("text, due_date")
          .in("due_date", targetDates)

        console.log(`Buscando Pendentes para ${targetDates} -> Encontrados: ${items?.length ?? 0}`);
        items?.forEach(item => queueEmail(item.text, item.due_date, "Pendente"));
      }

      // LÓGICA CONCLUÍDOS (Tabela task_done)
      if (pref.concluded_enabled) {
        const targetDates = buildTargetDates(today, pref.concluded_schedule || []);
        const { data: doneTasks } = await supabase
          .from("task_done")
          .select(`done_at, items ( text )`)
          .eq("user_id", pref.user_id);

        doneTasks?.forEach(task => {
          if (!task.done_at || !task.items) return;
          const doneDate = task.done_at.split("T")[0];
          if (targetDates.includes(doneDate)) {
            const itemText = (task.items as any)?.text || "Tarefa s/ nome";
            queueEmail(itemText, doneDate, "Concluída");
          }
        });
      }
    }

    await Promise.all(emailPromises);
    console.log(`=== FIM DO PROCESSO. TOTAL ENVIADO: ${totalSent} ===`);
    return NextResponse.json({ success: true, sent: totalSent });

  } catch (err) {
    console.error("ERRO CRÍTICO NA ROTA:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}