import nodemailer from 'nodemailer';

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
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: `Leave Request ${status}`,
    text: body,
    html: `<p>${body}</p>`,
  });
}

export async function sendTimesheetReturned(email, { weekStart, reason }) {
  const t = getTransport();
  const body = `Your timesheet for the week of ${weekStart} has been returned for corrections.${reason ? ' Reason: ' + reason : ''}`;
  if (!t) { console.log(`[mailer:dev] timesheet returned for ${email}: ${body}`); return; }
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Timesheet Returned',
    text: body,
    html: `<p>${body}</p>`,
  });
}

export async function sendLeaveRequest(managerEmail, { employeeName, type, startDate, endDate }) {
  const t = getTransport();
  const body = `${employeeName} has submitted a ${type} leave request from ${startDate} to ${endDate}. Please review it in the Requests tab.`;
  if (!t) { console.log(`[mailer:dev] leave request to manager ${managerEmail}: ${body}`); return; }
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: managerEmail,
    subject: `Leave Request from ${employeeName}`,
    text: body,
    html: `<p>${body}</p>`,
  });
}
