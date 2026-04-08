import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) throw new Error("SMTP_USER and SMTP_APP_PASSWORD not configured");

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return transporter;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}) {
  const transport = getTransporter();

  await transport.sendMail({
    from: `"3emtuff" <${process.env.SMTP_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
