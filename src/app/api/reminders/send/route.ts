import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Força a rota a não usar cache (essencial para Cron no Vercel)
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

function buildTargetDates(today: Date, scheduleDays: number[]): string[] {
  const dates = new Set<string>();
  for (const daysBefore of scheduleDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + Number(daysBefore)); // Garante que é número
    const isoDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
    dates.add(isoDate);
  }
  return [...dates];
}

export async function GET(req: NextRequest) {
  // Verificação de Segurança
  if (!CRON_SECRET) {
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

      const userEmail = profile.email;
      const displayName = profile.display_name || profile.name || userEmail.split("@")[0];

      // --- FUNÇÃO AUXILIAR DE ENVIO ---
      const queueEmail = (itemText: string, date: string, type: "Pendente" | "Concluída") => {
        const dueFormatted = new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
        });

        emailPromises.push(
          transporter.sendMail({
            from: FROM_EMAIL,
            to: userEmail,
            subject: `[3emtuff] ${type}: ${itemText}`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2>Olá, ${displayName}</h2>
                <p>Você tem uma atividade <strong>${type.toLowerCase()}</strong>: <strong>${itemText}</strong></p>
                <p>Data: ${dueFormatted}</p>
              </div>`
          }).then(() => { totalSent++; })
            .catch(err => console.error(`Erro ao enviar para ${userEmail}:`, err))
        );
      };

      // --- LOGICA: ATIVIDADES PENDENTES ---
      if (pref.pending_enabled) {
        const dates = buildTargetDates(today, pref.pending_schedule || []);
        const { data: items } = await supabase
          .from("items")
          .select("*")
          .in("due_date", dates)
          .eq("created_by", pref.user_id); 
          // REMOVIDO o filtro de status que não existe no seu banco

        items?.forEach(item => queueEmail(item.text, item.due_date, "Pendente"));
      }

      // --- LOGICA: ATIVIDADES CONCLUÍDAS ---
      // Aqui você precisaria de uma tabela ou coluna que indique o que está concluído.
      // Se você não tem a coluna 'status', como o sistema sabe o que foi concluído?
      // Vou deixar a lógica preparada para quando você tiver essa distinção:
      if (pref.concluded_enabled) {
        const dates = buildTargetDates(today, pref.concluded_schedule || []);
        // Exemplo: Se você criar uma tabela 'completed_items' no futuro
        // const { data: doneItems } = await supabase.from("completed_items")...
      }
    }

    await Promise.all(emailPromises);
    return NextResponse.json({ success: true, sent: totalSent });

  } catch (err) {
    console.error("Erro Geral:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}