import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authService } from './auth.service.ts';
import { z } from 'zod';

const twoFactorSchema = z.object({
  tempToken: z.string().min(10),
  totpCode: z.string().regex(/^\d{6}$/),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    newPasswordConfirmation: z.string(),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirmation, {
    message: 'Şifreler eşleşmiyor',
    path: ['newPasswordConfirmation'],
  });

export function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const result = await authService.register(app, request, request.body, reply);
    return reply.code(201).send({ success: true, message: 'Hesap oluşturuldu', data: result });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const result = await authService.login(app, request, request.body, reply);
    return reply.send({ success: true, message: 'Giriş başarılı', data: result });
  });

  app.post('/api/auth/2fa/verify', async (request, reply) => {
    const body = twoFactorSchema.parse(request.body);
    const result = await authService.verify2FA(app, request, body, reply);
    return reply.send({ success: true, message: '2FA doğrulandı', data: result });
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const result = await authService.refresh(app, request, reply);
    return reply.send({ success: true, message: 'Token yenilendi', data: result });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const result = await authService.logout(app, request, reply);
    return reply.send({ success: true, message: 'Çıkış yapıldı', data: result });
  });

  app.post('/api/auth/forgot-password', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    await authService.requestPasswordReset(app, email);
    return reply.send({ success: true, message: 'Şifre sıfırlama bağlantısı gönderildi', data: null });
  });

  app.post('/api/auth/reset-password', async (request, reply) => {
    const body = z
      .object({
        token: z.string().min(10),
        password: z.string().min(8),
        passwordConfirmation: z.string(),
      })
      .refine((d) => d.password === d.passwordConfirmation, { message: 'Şifreler eşleşmiyor' })
      .parse(request.body);
    await authService.resetPassword(app, body.token, body.password);
    return reply.send({ success: true, message: 'Şifre güncellendi', data: null });
  });

  app.post('/api/auth/verify-email', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.body);
    const result = await authService.verifyEmail(app, token);
    return reply.send({ success: true, message: 'E-posta doğrulandı', data: result });
  });

  app.post('/api/auth/resend-verification', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    await authService.resendVerification(app, email);
    return reply.send({ success: true, message: 'Doğrulama e-postası gönderildi', data: null });
  });

  // ─── Authenticated ───
  const authed = async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);
  };

  app.get('/api/auth/me', { preHandler: authed }, async (request, reply) => {
    const { toAuthUser } = await import('./auth.service.ts');
    const user = await toAuthUser(request.user!.id);
    return reply.send({ success: true, message: 'Kullanıcı bilgisi', data: { user } });
  });

  app.post('/api/auth/change-password', { preHandler: authed }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);
    const result = await authService.changePassword(app, request.user!.id, body.currentPassword, body.newPassword);
    return reply.send({ success: true, message: 'Şifre değiştirildi', data: result });
  });

  app.post('/api/auth/2fa/setup', { preHandler: authed }, async (request, reply) => {
    const result = await authService.start2FA(app, request.user!.id);
    return reply.send({ success: true, message: '2FA kurulumu', data: result });
  });

  app.post('/api/auth/2fa/enable', { preHandler: authed }, async (request, reply) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    const result = await authService.enable2FA(app, request.user!.id, code);
    return reply.send({ success: true, message: '2FA aktif', data: result });
  });

  app.post('/api/auth/2fa/disable', { preHandler: authed }, async (request, reply) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    const result = await authService.disable2FA(app, request.user!.id, code);
    return reply.send({ success: true, message: '2FA kapatıldı', data: result });
  });
}