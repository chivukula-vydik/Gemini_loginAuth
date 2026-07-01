import nodemailer from 'nodemailer';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let transport = null;

function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_HOST) return null;
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

export async function sendLeaveDecision(email, { type, startDate, endDate, decision }) {
  const t = getTransport();
  const status = decision === 'approved' ? 'Approved' : 'Rejected';
  const body = `Your ${type} leave request from ${startDate} to ${endDate} has been ${decision}.`;
  if (!t) { console.log(`[mailer:dev] leave decision for ${email}: ${body}`); return; }
  const htmlBody = `Your ${esc(type)} leave request from ${esc(startDate)} to ${esc(endDate)} has been ${esc(decision)}.`;
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: `Leave Request ${status}`,
    text: body,
    html: `<p>${htmlBody}</p>`,
  });
}

export async function sendTimesheetReturned(email, { weekStart, reason }) {
  const t = getTransport();
  const body = `Your timesheet for the week of ${weekStart} has been returned for corrections.${reason ? ' Reason: ' + reason : ''}`;
  if (!t) { console.log(`[mailer:dev] timesheet returned for ${email}: ${body}`); return; }
  const htmlBody = `Your timesheet for the week of ${esc(weekStart)} has been returned for corrections.${reason ? ' Reason: ' + esc(reason) : ''}`;
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Timesheet Returned',
    text: body,
    html: `<p>${htmlBody}</p>`,
  });
}

export async function sendOfferEmail(email, { candidateName, designation, ctcAnnual, joiningDate, portalLink }) {
  const t = getTransport();
  const ctcFormatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(ctcAnnual);
  const joinFormatted = new Date(joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `Offer Letter — ${designation}`;
  const text = [
    `Hi ${candidateName},`,
    '',
    `We are pleased to extend an offer for the position of ${designation}.`,
    '',
    `CTC (Annual): ${ctcFormatted}`,
    `Joining Date: ${joinFormatted}`,
    '',
    `Please review and respond to your offer using the link below:`,
    portalLink,
    '',
    `This link is valid until 7 days after your joining date.`,
    '',
    'Regards,',
    'HR Team',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#4338ca;margin:0 0 20px">Offer Letter</h2>
      <p>Hi ${esc(candidateName)},</p>
      <p>We are pleased to extend an offer for the position of <strong>${esc(designation)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#475569">CTC (Annual)</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${ctcFormatted}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#475569">Joining Date</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${joinFormatted}</td></tr>
      </table>
      <p>Please review and respond to your offer:</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${portalLink}" style="display:inline-block;padding:12px 32px;background:#4338ca;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View & Respond to Offer</a>
      </p>
      <p style="font-size:13px;color:#64748b">This link is valid until 7 days after your joining date.</p>
      <p>Regards,<br/>HR Team</p>
    </div>`;
  if (!t) { console.log(`[mailer:dev] offer email for ${email}: ${portalLink}`); return; }
  await t.sendMail({ from: process.env.MAIL_FROM, to: email, subject, text, html });
}

export async function sendWelcomeEmail(email, { name, resetLink }) {
  const t = getTransport();
  const subject = `Welcome aboard — set up your account`;
  const text = [
    `Hi ${name},`,
    '',
    'Welcome to the team! Your account has been created.',
    '',
    'Set your password and log in using the link below:',
    resetLink,
    '',
    'This link expires in 72 hours.',
    '',
    'Regards,',
    'HR Team',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 20px">Welcome aboard!</h2>
      <p>Hi ${esc(name)},</p>
      <p>Your account has been created. Set your password to get started:</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${resetLink}" style="display:inline-block;padding:12px 32px;background:#334155;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Set Password & Log In</a>
      </p>
      <p style="font-size:13px;color:#64748b">This link expires in 72 hours.</p>
      <p>Regards,<br/>HR Team</p>
    </div>`;
  if (!t) { console.log(`[mailer:dev] welcome email for ${email}: ${resetLink}`); return; }
  await t.sendMail({ from: process.env.MAIL_FROM, to: email, subject, text, html });
}

export async function sendLeaveRequest(managerEmail, { employeeName, type, startDate, endDate }) {
  const t = getTransport();
  const body = `${employeeName} has submitted a ${type} leave request from ${startDate} to ${endDate}. Please review it in the Requests tab.`;
  if (!t) { console.log(`[mailer:dev] leave request to manager ${managerEmail}: ${body}`); return; }
  const htmlBody = `${esc(employeeName)} has submitted a ${esc(type)} leave request from ${esc(startDate)} to ${esc(endDate)}. Please review it in the Requests tab.`;
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: managerEmail,
    subject: `Leave Request from ${employeeName}`,
    text: body,
    html: `<p>${htmlBody}</p>`,
  });
}
