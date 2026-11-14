import nodemailer from "nodemailer";

interface AuthEmailOptions {
  to: string;
  subject: string;
  url: string;
}

export async function sendAuthEmail({ to, subject, url }: AuthEmailOptions): Promise<void> {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) {
    throw new Error("SMTP_HOST e SMTP_FROM são necessários para enviar e-mails de autenticação.");
  }
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT precisa ser um número de porta válido.");
  }

  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("Configure SMTP_USER e SMTP_PASSWORD juntos.");
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });
  await transporter.sendMail({
    from,
    to,
    subject,
    text: `${subject}\n\nAcesse o link para continuar:\n${url}\n\nSe você não solicitou esta ação, ignore esta mensagem.`,
  });
}
