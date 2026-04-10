import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const CRON_SECRET = process.env.CRON_SECRET;

export const getAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Configurações do Nodemailer via variáveis de ambiente
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST, // ex: smtp.gmail.com
  port: Number(process.env.EMAIL_SERVER_PORT) || 587,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS, // Use "App Password" se for Gmail
  },
});

const FROM_EMAIL = process.env.GMAIL_USER ? `3emtuff <${process.env.GMAIL_USER}>` : "3emtuff <no-reply@3emtuff.com>";

function buildTargetDates(today: Date, scheduleDays: number[]): string[] {
  const dates = new Set<string>();
  for (const daysBefore of scheduleDays) {
    const d = new Date(today);
    if (daysBefore === 0) {
      dates.add(d.toISOString().split("T")[0]);
    } else {
      d.setDate(d.getDate() + daysBefore);
      dates.add(d.toISOString().split("T")[0]);
    }
  }
  return [...dates];
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { data: prefs } = await supabase
      .from("reminder_preferences")
      .select("*")
      .returns<Database["public"]["Tables"]["reminder_preferences"]["Row"][]>();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, display_name, email")
      .returns<Database["public"]["Tables"]["profiles"]["Row"][]>();
      
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    let totalSent = 0;

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      const userEmail = profile?.email;
      if (!userEmail) continue;

      const displayName = profile?.display_name || profile?.name || userEmail.split("@")[0];

      // --- Lógica de PENDING e CONCLUDED permanece a mesma ---
      // (Omiti a lógica repetida de busca para focar na função de envio)

      const sendEmail = async (subject: string, html: string) => {
        await transporter.sendMail({
          from: FROM_EMAIL,
          to: userEmail,
          subject: subject,
          html: html,
        });
        totalSent++;
      };

      // Exemplo aplicado no bloco PENDING:
      const pendingEnabled = pref.pending_enabled ?? pref.enabled ?? true;
      const pendingSchedule = (pref.pending_schedule ?? pref.schedule_days) ?? [0, 1, 2];

      if (pendingEnabled && pendingSchedule.length > 0) {
        const targetDates = buildTargetDates(today, pendingSchedule);
        // No bloco PENDING
        // No bloco PENDING
      const { data: userItems, error } = await supabase
        .from("items")
        .select("*")
        .in("due_date", targetDates)
        .eq("created_by", pref.user_id);

      // Se o TS ainda reclamar de 'never', faça o cast manual no 'data':
      const items = (userItems as Database["public"]["Tables"]["items"]["Row"][]) ?? [];

      for (const item of items) {
        const dueDate = item.due_date;
        if (!dueDate) continue;

        const dueFormatted = new Date(dueDate + "T00:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
        });

        await sendEmail(
          `[3emtuff] Pendente: ${item.text}`,
          `<div style="font-family: sans-serif;">
            <h2>Olá, ${displayName}</h2>
            <p>Você tem uma atividade pendente: <strong>${item.text}</strong></p>
            <p>Data de entrega: ${dueFormatted}</p>
          </div>`
        );
      }
      } 
      
      // Repita a chamada sendEmail no bloco de CONCLUDED...
    }

    return NextResponse.json({ sent: totalSent });
  } catch (err) {
    console.error("Reminder error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}