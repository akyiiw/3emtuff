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

const FROM_EMAIL = process.env.GMAIL_USER ? `3emtuff <${process.env.GMAIL_USER}>` : "3emtuff <no-reply@3emtuff.com>";

function buildTargetDates(today: Date, scheduleDays: number[]): string[] {
  const dates = new Set<string>();
  for (const daysBefore of scheduleDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + daysBefore);
    // Use local timezone format to avoid UTC offset issues shifting the day
    const localDateString = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
    dates.add(localDateString);
  }
  return [...dates];
}

export async function GET(req: NextRequest) {
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
      .select("*");

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, display_name, email");
      
    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    let totalSent = 0;
    
    // Array to hold all email promises so we can send them concurrently
    const emailPromises: Promise<void>[] = [];

    for (const pref of (prefs ?? [])) {
      const profile = profileMap.get(pref.user_id);
      const userEmail = profile?.email;
      if (!userEmail) continue;

      const displayName = profile?.display_name || profile?.name || userEmail.split("@")[0];

      // --- PENDING BLOCK ---
      const pendingEnabled = pref.pending_enabled ?? pref.enabled ?? true;
      const pendingSchedule = (pref.pending_schedule ?? pref.schedule_days) ?? [0, 1, 2];

      if (pendingEnabled && pendingSchedule.length > 0) {
        const targetDates = buildTargetDates(today, pendingSchedule);
        
        const { data: userItems, error } = await supabase
          .from("items")
          .select("*")
          .in("due_date", targetDates)
          .eq("created_by", pref.user_id)
          .eq("status", "pending"); // IMPORTANT: Ensure you don't email about completed tasks

        const items = (userItems as Database["public"]["Tables"]["items"]["Row"][]) ?? [];

        for (const item of items) {
          const dueDate = item.due_date;
          if (!dueDate) continue;

          // Note: added 'T12:00:00' so the timezone offset doesn't accidentally push it back a day
          const dueFormatted = new Date(dueDate + "T12:00:00").toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
          });

          // Push the email task to the array instead of awaiting it sequentially
          emailPromises.push(
            transporter.sendMail({
              from: FROM_EMAIL,
              to: userEmail,
              subject: `[3emtuff] Pendente: ${item.text}`,
              html: `<div style="font-family: sans-serif;">
                <h2>Olá, ${displayName}</h2>
                <p>Você tem uma atividade pendente: <strong>${item.text}</strong></p>
                <p>Data de entrega: ${dueFormatted}</p>
              </div>`,
            }).then(() => {
              totalSent++;
            }).catch((err) => {
              // Catch individual email errors so the rest still process
              console.error(`Failed to send email to ${userEmail}:`, err);
            })
          );
        }
      } 
      
      // --- CONCLUDED BLOCK ---
      // Apply similar logic here, pushing to emailPromises
    }

    // Wait for all emails to finish sending in parallel
    await Promise.all(emailPromises);

    return NextResponse.json({ sent: totalSent });
  } catch (err) {
    console.error("Reminder error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}