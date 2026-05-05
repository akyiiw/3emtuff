import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const client = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_SECRET_KEY;
  const refreshToken = process.env.REFRESH_TOKEN;

  
  
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: 
    { 
      type: "OAuth2",
      user: user,
      clientId: client,
      clientSecret: secret,
      refreshToken: refreshToken
    },
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
    from: `"3emtuff" <${process.env.GMAIL_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
