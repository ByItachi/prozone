import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from '@novapanel/db';
import { createLogger } from '@novapanel/logger';
import type { FastifyInstance } from 'fastify';

const log = createLogger('email');

let transport: Transporter | null = null;

function getTransport(app: FastifyInstance): Transporter {
  if (transport) return transport;
  const env = app.env;
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transport;
}

interface TemplateData {
  [key: string]: string | number | boolean;
}

const TEMPLATES: Record<string, { subject: string; html: (d: TemplateData) => string }> = {
  WELCOME: {
    subject: 'Hoş geldiniz 🎉',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">${d.appName}, hoş geldiniz ${d.name}!</h2>
        <p style="color:#374151">Hesabınız başarıyla oluşturuldu. Aşağıdaki buton ile e-posta adresinizi doğrulayın.</p>
        <a href="${d.link}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">E-postayı Doğrula</a>
        <p style="color:#9ca3af;font-size:12px">Bağlantı ${d.ttl} dakika geçerlidir.</p>
      </div>`,
  },
  PASSWORD_RESET: {
    subject: 'Şifre Sıfırlama',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">Şifre Sıfırlama Talebi</h2>
        <p style="color:#374151">Hesabınız için şifre sıfırlama talebi alındı.</p>
        <a href="${d.link}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Şifreyi Sıfırla</a>
        <p style="color:#9ca3af;font-size:12px">Bu isteği siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
      </div>`,
  },
  LOGIN_NOTIFICATION: {
    subject: 'Yeni Giriş Bildirimi',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">Güvenlik Bildirimi</h2>
        <p style="color:#374151">Hesabınıza yeni bir giriş yapıldı.</p>
        <p style="color:#374151"><strong>IP:</strong> ${d.ip}<br/><strong>Tarih:</strong> ${d.time}<br/><strong>Cihaz:</strong> ${d.device}</p>
        <p style="color:#9ca3af;font-size:12px">Bu siz değilseniz şifrenizi değiştirin.</p>
      </div>`,
  },
  PAYMENT_SUCCESS: {
    subject: 'Ödeme Başarılı ✅',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">Ödeme Alındı</h2>
        <p style="color:#374151">${d.amount} ${d.currency} tutarındaki ödemeniz başarıyla tamamlandı.</p>
      </div>`,
  },
  PAYMENT_FAILED: {
    subject: 'Ödeme Başarısız ⚠️',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">Ödeme Başarısız</h2>
        <p style="color:#374151">${d.message ?? 'Ödemeniz işlenirken bir sorun oluştu.'} Lütfen tekrar deneyin.</p>
      </div>`,
  },
  SERVICE_ACTIVATED: {
    subject: 'Servis Aktif 🚀',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">${d.service} aktif edildi</h2>
        <p style="color:#374151">Servisiniz kullanıma hazır.</p>
      </div>`,
  },
  SERVICE_EXPIRING: {
    subject: 'Servis Süresi Dolmak Üzere',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">Servis Yenileme</h2>
        <p style="color:#374151">${d.service} servisiniz ${d.date} tarihinde sona erecek. Lütfen yenileyin.</p>
      </div>`,
  },
  TICKET_REPLY: {
    subject: 'Destek Talebi Yanıtlandı',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">${d.ticket}</h2>
        <p style="color:#374151">Destek talebinize yeni bir yanıt eklendi.</p>
        <a href="${d.link}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Görüntüle</a>
      </div>`,
  },
  SECURITY_ALERT: {
    subject: 'Güvenlik Uyarısı 🛡️',
    html: (d) => `
      <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#111827">Güvenlik Uyarısı</h2>
        <p style="color:#374151">${d.message}</p>
      </div>`,
  },
};

export async function sendTemplateEmail(
  app: FastifyInstance,
  to: string,
  template: string,
  data: TemplateData,
) {
  const tpl = TEMPLATES[template];
  if (!tpl) {
    log.warn({ template }, 'Unknown email template');
    return;
  }
  const env = app.env;
  const html = tpl.html({ appName: env.APP_NAME, ...data });

  if (env.NODE_ENV === 'test') {
    log.info({ to, template }, 'email (test mode)');
    return;
  }

  try {
    const transporter = getTransport(app);
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: tpl.subject,
      html,
    });
    await prisma.auditLog.create({
      data: { action: 'EMAIL_SENT', metadata: { to, template } },
    });
    log.info({ to, template }, 'email sent');
  } catch (err) {
    log.error({ err }, 'email send failed');
  }
}