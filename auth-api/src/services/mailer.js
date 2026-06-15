import nodemailer from 'nodemailer';

let transport = null;

function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_HOST) return null; // dev: no SMTP configured
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendPasswordReset(email, resetUrl) {
  const t = getTransport();
  if (!t) {
    console.log(`[mailer:dev] password reset for ${email}: ${resetUrl}`);
    return;
  }
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Reset your password',
    text: `Reset your password using this link: ${resetUrl}`,
    html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}
