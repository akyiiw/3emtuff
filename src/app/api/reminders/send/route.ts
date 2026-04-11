import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

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

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT) || 587,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

const FROM_EMAIL = `3emtuff <${process.env.GMAIL_USER}>`;

// Transforma os dias do agendamento em datas textuais (YYYY-MM-DD)
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
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { data: prefs } = await supabase.from("reminder_preferences").select("*");
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, name, email");
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

    let totalSent = 0;
    const emailPromises: Promise<void>[] = [];

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      if (!profile?.email) continue;

      console.log("-----------------------------------------");
      console.log("PROCESSANDO USUÁRIO:");
      console.log("ID:", pref.user_id);
      console.log("Nome:", profile?.display_name || profile?.name);
      console.log("Email:", profile?.email);
      console.log("Preferências:", {
        pendentes_ativo: pref.pending_enabled,
        agenda_pendentes: pref.pending_schedule,
        concluidos_ativo: pref.concluded_enabled,
        agenda_concluidos: pref.concluded_schedule
      });
      console.log("-----------------------------------------");

      if (!profile?.email) {
        console.log(`PULANDO: Usuário ${pref.user_id} não tem email vinculado.`);
        continue;
      }

      const userEmail = profile.email;
      const displayName = profile.display_name || profile.name || userEmail.split("@")[0];

      // Função para padronizar o envio de e-mail
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
            html: `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px;">
                <h2 style="color: #2e7d32;">Olá, ${displayName}</h2>
                <p>Notificação de atividade <strong>${type.toLowerCase()}</strong>:</p>
                <p style="font-size: 18px;"><strong>${title}</strong></p>
                <p style="color: #666;">Data registrada: ${dateFormatted}</p>
              </div>`
          }).then(() => { totalSent++; })
            .catch(err => console.error(`Erro e-mail ${userEmail}:`, err))
        );
      };

      // --- 1. BUSCA PENDENTES (Tabela 'items') ---
      if (pref.pending_enabled) {
        const targetDates = buildTargetDates(today, pref.pending_schedule || []);
        const { data: items } = await supabase
          .from("items")
          .select("text, due_date")
          .in("due_date", targetDates)
          .eq("created_by", pref.user_id);

        items?.forEach(item => queueEmail(item.text, item.due_date, "Pendente"));
      }

      // --- 2. BUSCA CONCLUÍDAS (Tabela 'task_done' + join com 'items') ---
      if (pref.concluded_enabled) {
        const targetDates = buildTargetDates(today, pref.concluded_schedule || []);
        
        // Aqui buscamos na task_done, mas precisamos do texto que está na items
        const { data: doneTasks } = await supabase
          .from("task_done")
          .select(`
            done_at,
            items ( text )
          `)
          .eq("user_id", pref.user_id);

        doneTasks?.forEach(task => {
          if (!task.done_at || !task.items) return;
          
          // Extrai apenas a data YYYY-MM-DD do done_at (que é timestamp)
          const doneDate = task.done_at.split("T")[0];
          
          // Se a data da conclusão estiver na lista de datas do agendamento, envia!
          if (targetDates.includes(doneDate)) {
            const itemText = Array.isArray(task.items) ? task.items[0]?.text : (task.items as any)?.text;
            queueEmail(itemText || "Tarefa s/ nome", doneDate, "Concluída");
          }
        });
      }
    }

    await Promise.all(emailPromises);
    return NextResponse.json({ success: true, sent: totalSent });

  } catch (err) {
    console.error("Erro Geral:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}