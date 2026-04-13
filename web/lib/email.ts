import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function hasSmtpCredentials(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.yandex.ru',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendViaResend({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Resend request failed: ${response.status} ${details}`.trim());
  }
}

async function deliverEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@lpvolley.ru';
  const brandedFrom = `"Лютые Пляжники" <${fromAddress}>`;

  if (hasSmtpCredentials()) {
    await getTransporter().sendMail({
      from: brandedFrom,
      to,
      subject,
      html,
    });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    await sendViaResend({
      from: fromAddress,
      to,
      subject,
      html,
    });
    return;
  }

  throw new Error('No email provider configured: SMTP credentials and RESEND_API_KEY are missing');
}

export async function sendAppEmail({
  to,
  subject,
  html,
}: {
  to: string | null | undefined;
  subject: string;
  html: string;
}): Promise<boolean> {
  const target = String(to || '').trim();
  if (!target) return false;

  try {
    await deliverEmail({ to: target, subject, html });
    return true;
  } catch {
    return false;
  }
}

export async function sendResetEmail(to: string, token: string): Promise<void> {
  const siteUrl = String(
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://lpvolley.ru'
  ).replace(/\/+$/, '');
  const resetUrl = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;

  await deliverEmail({
    to,
    subject: 'Сброс пароля — lpvolley.ru',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0A0A1F;color:#fff;border-radius:16px;">
        <h2 style="color:#FF9500;margin:0 0 16px;">Сброс пароля</h2>
        <p>Вы (или кто-то другой) запросили сброс пароля на lpvolley.ru.</p>
        <p>Нажмите кнопку ниже, чтобы установить новый пароль:</p>
        <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:14px 32px;background:#FF9500;color:#000;font-weight:bold;text-decoration:none;border-radius:12px;">
          УСТАНОВИТЬ НОВЫЙ ПАРОЛЬ
        </a>
        <p style="color:#888;font-size:13px;">Ссылка действительна 1 час. Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>
      </div>
    `,
  });
}
