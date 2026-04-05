import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

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

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@lpvolley.ru';

  try {
    await getTransporter().sendMail({
      from: `"Лютые Пляжники" <${from}>`,
      to: target,
      subject,
      html,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `https://lpvolley.ru/play/index.html?route=reset&token=${token}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@lpvolley.ru';

  await getTransporter().sendMail({
    from: `"Лютые Пляжники" <${from}>`,
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
