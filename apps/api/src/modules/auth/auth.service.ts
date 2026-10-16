import argon2 from 'argon2';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../utils/errors.ts';
import { generateOpaqueToken, hashToken, generateBackupCodes } from '../../services/tokens.ts';
import { sendTemplateEmail } from '../../services/email.service.ts';
import { writeAudit } from '../../utils/audit.ts';
import { walletService } from '../wallet/wallet.service.ts';
import { getIp, getUserAgent } from '../../utils/context.ts';
import { resolveCountry, sourceIp, recordTraffic, maskIp } from '../../services/geo.service.ts';
import { publishLive } from '../../services/live.service.ts';
import type { AuthUser } from '@novapanel/types';
import { loginSchema, registerSchema } from '@novapanel/validation';
import type { FastifyRequest, FastifyReply } from 'fastify';

const SESSION_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

// ─── Hashing ───
export async function hashPassword(password: string, env: FastifyInstance['env']): Promise<string> {
  return argon2.hash(password, {
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
    type: argon2.argon2id,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// ─── DTO helpers ───
export async function toAuthUser(userId: string): Promise<AuthUser> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      wallet: true,
      twoFactor: true,
    },
  });
  if (!u) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı', 404);
  return {
    id: u.id,
    name: u.name,
    surname: u.surname,
    username: u.username,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    role: u.role.name,
    status: u.status,
    emailVerified: u.emailVerified,
    twoFactorEnabled: u.twoFactor?.enabled ?? false,
    createdAt: u.createdAt.toISOString(),
  };
}

// ─── Cookie helpers ───
function setAccessCookie(app: FastifyInstance, token: string, reply: FastifyReply) {
  reply.setCookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: app.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

function setRefreshCookie(app: FastifyInstance, token: string, reply: FastifyReply, rememberMe: boolean) {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: app.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge,
  });
}

function clearCookies(app: FastifyInstance, reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(SESSION_COOKIE, { path: '/api/auth' });
}

// ─── Session creation / rotation ───
async function createSession(
  app: FastifyInstance,
  userId: string,
  family: string,
  ip?: string,
  userAgent?: string,
  rememberMe = false,
): Promise<string> {
  const token = generateOpaqueToken();
  await prisma.session.create({
    data: {
      userId,
      refreshToken: hashToken(token),
      tokenFamily: family,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

async function issueTokens(
  app: FastifyInstance,
  userId: string,
  reply: FastifyReply,
  ip?: string,
  userAgent?: string,
  rememberMe = false,
  family?: string,
) {
  const sessionFamily = family ?? generateOpaqueToken();
  const refreshToken = await createSession(app, userId, sessionFamily, ip, userAgent, rememberMe);
  setRefreshCookie(app, refreshToken, reply, rememberMe);

  const accessToken = app.jwt.sign(
    { sub: userId, type: 'access', sessionId: sessionFamily },
    { expiresIn: app.env.JWT_ACCESS_EXPIRES_IN },
  );
  setAccessCookie(app, accessToken, reply);
  return { accessToken, sessionFamily };
}

// ─── Account lockout ───
async function recordFailedLogin(app: FastifyInstance, email: string, userId: string | null, ip?: string, userAgent?: string, reason?: string) {
  await prisma.loginAttempt.create({
    data: { email, userId, ip, userAgent, success: false, reason },
  });
  const geo = await resolveCountry(ip ?? null);
  await recordTraffic({
    kind: 'LOGIN_FAILED',
    userId,
    ip: ip ?? null,
    userAgent: userAgent ?? null,
    path: '/api/auth/login',
    method: 'POST',
    status: 401,
    country: geo.iso2,
    countryName: geo.name,
    reliability: geo.reliability,
    metadata: { reason },
    liveMessage: `Failed login: ${maskIp(ip ?? null) ?? 'unknown'} (${reason ?? 'credentials'})`,
  });
  publishLive({
    type: 'SECURITY_ALERT',
    outcome: 'FAILED',
    actor: userId ?? undefined,
    ipMasked: maskIp(ip ?? null),
    country: geo.iso2,
    countryName: geo.name,
    message: `Failed login attempt${reason ? `: ${reason}` : ''}`,
  });
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { failedLoginCount: true } });
    const count = (user?.failedLoginCount ?? 0) + 1;
    const settings = app.env;
    if (count >= settings.MAX_LOGIN_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + settings.ACCOUNT_LOCK_MINUTES * 60 * 1000),
        },
      });
    } else {
      await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: count } });
    }
  }
}

// ─── Public service object ───
export const authService = {
  async register(app: FastifyInstance, request: FastifyRequest, input: unknown, reply: FastifyReply) {
    const data = registerSchema.parse(input);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { username: data.username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      if (existing.email === data.email) throw new AppError('EMAIL_TAKEN', 'Bu e-posta zaten kayıtlı', 409);
      throw new AppError('USERNAME_TAKEN', 'Bu kullanıcı adı zaten alınmış', 409);
    }

    const passwordHash = await hashPassword(data.password, app.env);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        surname: data.surname,
        username: data.username,
        email: data.email,
        phone: data.phone || null,
        passwordHash,
        roleId: (await prisma.role.findUnique({ where: { name: 'USER' } }))!.id,
      },
    });
    await walletService.getOrCreate(user.id);

    const emailToken = generateOpaqueToken();
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        token: hashToken(emailToken),
        type: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + app.env.VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    });

    const verifyLink = `${app.env.WEB_URL}/verify-email?token=${emailToken}`;
    await sendTemplateEmail(app, user.email, 'WELCOME', {
      name: user.name,
      link: verifyLink,
      ttl: String(app.env.VERIFICATION_TOKEN_TTL_MINUTES),
    });

    const regIp = sourceIp(request);
    const regGeo = await resolveCountry(regIp);
    await writeAudit({
      action: 'USER_CREATED',
      userId: user.id,
      ip: getIp(request),
      userAgent: getUserAgent(request),
      target: 'User',
      targetId: user.id,
    });
    await recordTraffic({
      kind: 'USER_REGISTER',
      userId: user.id,
      ip: regIp,
      userAgent: getUserAgent(request),
      path: '/api/auth/register',
      method: 'POST',
      status: 201,
      country: regGeo.iso2,
      countryName: regGeo.name,
      reliability: regGeo.reliability,
      liveMessage: `New registration: ${user.username}`,
    });

    // Auto-login: issue session cookies so the new user lands authenticated.
    await issueTokens(app, user.id, reply, getIp(request), getUserAgent(request), false);

    return { user: await toAuthUser(user.id) };
  },

  async login(app: FastifyInstance, request: FastifyRequest, input: unknown, reply: FastifyReply) {
    const data = loginSchema.parse(input);
    const ip = getIp(request);
    const ua = getUserAgent(request);

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.identifier }, { username: data.identifier }],
        deletedAt: null,
      },
      include: { role: true, twoFactor: true },
    });

    if (!user) {
      await recordFailedLogin(app, data.identifier, null, ip, ua, 'USER_NOT_FOUND');
      throw new AppError('INVALID_CREDENTIALS', 'E-posta/kullanıcı adı veya şifre hatalı', 401);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError('ACCOUNT_LOCKED', `Çok fazla hatalı deneme. Hesap ${mins} dakika kilitli.`, 423);
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      await recordFailedLogin(app, data.identifier, user.id, ip, ua, 'WRONG_PASSWORD');
      await writeAudit({ action: 'LOGIN_FAILED', userId: user.id, ip, userAgent: ua, target: 'User', targetId: user.id });
      throw new AppError('INVALID_CREDENTIALS', 'E-posta/kullanıcı adı veya şifre hatalı', 401);
    }

    if (user.status === 'BANNED') {
      throw new AppError('ACCOUNT_BANNED', 'Hesabınız yasaklandı. Desteğe başvurun.', 403);
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError('ACCOUNT_SUSPENDED', 'Hesabınız askıya alındı. Desteğe başvurun.', 403);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    await prisma.loginAttempt.create({
      data: { email: user.email, userId: user.id, ip, userAgent: ua, success: true },
    });

    // 2FA flow
    if (user.twoFactor?.enabled) {
      const tempToken = app.jwt.sign(
        { sub: user.id, type: '2fa' },
        { expiresIn: '5m' },
      );
      return { requires2FA: true, tempToken, user: undefined };
    }

    await issueTokens(app, user.id, reply, ip, ua, data.rememberMe);
    const loginGeo = await resolveCountry(ip ?? null);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });
    await writeAudit({
      action: 'USER_LOGIN',
      userId: user.id,
      ip,
      userAgent: ua,
      target: 'User',
      targetId: user.id,
      metadata: { identifier: data.identifier, country: loginGeo.iso2 ?? null },
    });
    await recordTraffic({
      kind: 'LOGIN_SUCCESS',
      userId: user.id,
      ip: ip ?? null,
      userAgent: ua ?? null,
      path: '/api/auth/login',
      method: 'POST',
      status: 200,
      country: loginGeo.iso2,
      countryName: loginGeo.name,
      reliability: loginGeo.reliability,
      liveMessage: `Login: ${user.username}${loginGeo.iso2 ? ` from ${loginGeo.iso2}` : ' from local/private IP'}`,
    });
    await sendTemplateEmail(app, user.email, 'LOGIN_NOTIFICATION', {
      ip: ip ?? 'Bilinmiyor',
      time: new Date().toLocaleString('tr-TR'),
      device: ua ?? 'Bilinmiyor',
    });

    return { requires2FA: false, user: await toAuthUser(user.id) };
  },

  async verify2FA(app: FastifyInstance, request: FastifyRequest, body: { tempToken: string; totpCode: string }, reply: FastifyReply) {
    let payload: { sub: string; type?: string };
    try {
      payload = app.jwt.verify<{ sub: string; type?: string }>(body.tempToken);
    } catch {
      throw new AppError('INVALID_2FA_TOKEN', 'Oturum doğrulama süresi doldu, tekrar giriş yapın', 401);
    }
    if (payload.type !== '2fa') throw new AppError('INVALID_2FA_TOKEN', 'Geçersiz doğrulama tokenı', 401);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { twoFactor: true },
    });
    if (!user?.twoFactor?.enabled) throw new AppError('INVALID_2FA_TOKEN', '2FA aktif değil', 400);

    if (!authenticator.check(body.totpCode, user.twoFactor.secret)) {
      await prisma.loginAttempt.create({
        data: { email: user.email, userId: user.id, ip: getIp(request), userAgent: getUserAgent(request), success: false, reason: 'BAD_2FA' },
      });
      throw new AppError('INVALID_TOTP', 'Doğrulama kodu hatalı', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: getIp(request) },
    });
    await issueTokens(app, user.id, reply, getIp(request), getUserAgent(request), true);
    await prisma.loginAttempt.create({
      data: { email: user.email, userId: user.id, ip: getIp(request), userAgent: getUserAgent(request), success: true },
    });
    await writeAudit({ action: 'USER_LOGIN', userId: user.id, ip: getIp(request), userAgent: getUserAgent(request), metadata: { via: '2FA' } });
    const tfaGeo = await resolveCountry(sourceIp(request));
    await recordTraffic({
      kind: 'LOGIN_SUCCESS',
      userId: user.id,
      ip: sourceIp(request),
      userAgent: getUserAgent(request),
      path: '/api/auth/2fa/verify',
      method: 'POST',
      status: 200,
      country: tfaGeo.iso2,
      countryName: tfaGeo.name,
      reliability: tfaGeo.reliability,
      metadata: { via: '2FA' },
      liveMessage: `Login (2FA): ${user.username}`,
    });

    return { user: await toAuthUser(user.id) };
  },

  async refresh(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const oldToken = request.cookies[SESSION_COOKIE];
    if (!oldToken) throw new AppError('UNAUTHORIZED', 'Oturum bulunamadı', 401);

    const hashed = hashToken(oldToken);
    const session = await prisma.session.findUnique({ where: { refreshToken: hashed } });
    if (!session || session.revokedAt) throw new AppError('UNAUTHORIZED', 'Geçersiz oturum', 401);
    if (session.expiresAt < new Date()) throw new AppError('UNAUTHORIZED', 'Oturum süresi doldu', 401);

    const user = await prisma.user.findUnique({ where: { id: session.userId, deletedAt: null } });
    if (!user || user.status !== 'ACTIVE') throw new AppError('UNAUTHORIZED', 'Hesap aktif değil', 403);

    // Rotate: revoke old, issue new within same family (reuse detection)
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const existing = await prisma.session.findFirst({
      where: { tokenFamily: session.tokenFamily, revokedAt: null },
    });
    if (existing) {
      // Token reuse detected — revoke family
      await prisma.session.updateMany({
        where: { tokenFamily: session.tokenFamily },
        data: { revokedAt: new Date() },
      });
      await writeAudit({ action: 'SECURITY_ALERT' as never, userId: user.id, ip: getIp(request), metadata: { reason: 'REFRESH_TOKEN_REUSE' } });
      throw new AppError('UNAUTHORIZED', 'Oturum güvenliği ihlali tespit edildi', 401);
    }

    const rememberMe = (new Date(session.expiresAt).getTime() - Date.now()) > 24 * 60 * 60 * 1000;
    const result = await issueTokens(app, user.id, reply, getIp(request), getUserAgent(request), rememberMe, session.tokenFamily);
    return { accessToken: result.accessToken, user: await toAuthUser(user.id) };
  },

  async logout(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const oldToken = request.cookies[SESSION_COOKIE];
    if (oldToken) {
      await prisma.session.updateMany({
        where: { refreshToken: hashToken(oldToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearCookies(app, reply);
    await writeAudit({ action: 'USER_LOGOUT', userId: request.user?.id, ip: sourceIp(request) ?? undefined, userAgent: getUserAgent(request) ?? undefined });
    await recordTraffic({
      kind: 'LOGOUT',
      userId: request.user?.id ?? null,
      ip: sourceIp(request),
      userAgent: getUserAgent(request),
      path: '/api/auth/logout',
      method: 'POST',
      status: 200,
      liveMessage: 'Session ended (logout)',
    });
    return { loggedOut: true };
  },

  async requestPasswordReset(app: FastifyInstance, email: string) {
    const user = await prisma.user.findUnique({ where: { email, deletedAt: null } });
    if (!user) return; // no info leak

    const rawToken = generateOpaqueToken();
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        token: hashToken(rawToken),
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + app.env.VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    });
    const link = `${app.env.WEB_URL}/reset-password?token=${rawToken}`;
    await sendTemplateEmail(app, user.email, 'PASSWORD_RESET', { link });
  },

  async resetPassword(app: FastifyInstance, token: string, newPassword: string) {
    const emailToken = await prisma.emailToken.findUnique({
      where: { token: hashToken(token) },
    });
    if (!emailToken || emailToken.usedAt || emailToken.type !== 'PASSWORD_RESET') {
      throw new AppError('INVALID_TOKEN', 'Geçersiz veya kullanılmış bağlantı', 400);
    }
    if (emailToken.expiresAt < new Date()) {
      throw new AppError('TOKEN_EXPIRED', 'Bağlantının süresi doldu', 400);
    }
    await prisma.emailToken.update({ where: { id: emailToken.id }, data: { usedAt: new Date() } });
    const passwordHash = await hashPassword(newPassword, app.env);
    await prisma.user.update({
      where: { id: emailToken.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await prisma.session.updateMany({ where: { userId: emailToken.userId }, data: { revokedAt: new Date() } });
    await writeAudit({ action: 'PASSWORD_RESET', userId: emailToken.userId, target: 'User', targetId: emailToken.userId });
  },

  async verifyEmail(app: FastifyInstance, token: string) {
    const emailToken = await prisma.emailToken.findUnique({ where: { token: hashToken(token) } });
    if (!emailToken || emailToken.usedAt || emailToken.type !== 'VERIFY_EMAIL') {
      throw new AppError('INVALID_TOKEN', 'Geçersiz veya kullanılmış bağlantı', 400);
    }
    if (emailToken.expiresAt < new Date()) {
      throw new AppError('TOKEN_EXPIRED', 'Bağlantının süresi doldu', 400);
    }
    await prisma.emailToken.update({ where: { id: emailToken.id }, data: { usedAt: new Date() } });
    const user = await prisma.user.update({
      where: { id: emailToken.userId },
      data: { emailVerified: true },
    });
    await prisma.wallet.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
    await writeAudit({ action: 'EMAIL_VERIFIED', userId: user.id });
    return { verified: true };
  },

  async resendVerification(app: FastifyInstance, email: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase(), deletedAt: null } });
    if (!user || user.emailVerified) return;
    const rawToken = generateOpaqueToken();
    await prisma.emailToken.create({
      data: { userId: user.id, token: hashToken(rawToken), type: 'VERIFY_EMAIL', expiresAt: new Date(Date.now() + app.env.VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000) },
    });
    await sendTemplateEmail(app, user.email, 'WELCOME', {
      name: user.name,
      link: `${app.env.WEB_URL}/verify-email?token=${rawToken}`,
      ttl: String(app.env.VERIFICATION_TOKEN_TTL_MINUTES),
    });
  },

  async start2FA(app: FastifyInstance, userId: string) {
    const existing = await prisma.twoFactor.findUnique({ where: { userId } });
    if (existing?.enabled) throw new AppError('TWO_FA_ALREADY', '2FA zaten aktif', 400);
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userId + '@prozone', app.env.APP_NAME, secret);
    const qr = await qrcode.toDataURL(otpauth);
    const backupCodes = generateBackupCodes();
    await prisma.twoFactor.upsert({
      where: { userId },
      update: { secret, backupCodes: JSON.stringify(backupCodes), enabled: false },
      create: { userId, secret, backupCodes: JSON.stringify(backupCodes), enabled: false },
    });
    return { qr, secret, backupCodes };
  },

  async enable2FA(app: FastifyInstance, userId: string, code: string) {
    const tf = await prisma.twoFactor.findUnique({ where: { userId } });
    if (!tf) throw new AppError('NOT_FOUND', 'Önce 2FA başlatın', 400);
    if (!authenticator.check(code, tf.secret)) throw new AppError('INVALID_TOTP', 'Doğrulama kodu hatalı', 400);
    await prisma.twoFactor.update({ where: { userId }, data: { enabled: true } });
    await prisma.user.update({ where: { id: userId }, data: { twoFactorVerifiedAt: new Date() } });
    await writeAudit({ action: 'TWO_FA_ENABLED', userId });
    return { enabled: true, backupCodes: JSON.parse(tf.backupCodes) as string[] };
  },

  async disable2FA(app: FastifyInstance, userId: string, code: string) {
    const tf = await prisma.twoFactor.findUnique({ where: { userId } });
    if (!tf?.enabled) throw new AppError('NOT_FOUND', '2FA aktif değil', 400);
    if (!authenticator.check(code, tf.secret)) throw new AppError('INVALID_TOTP', 'Doğrulama kodu hatalı', 400);
    await prisma.twoFactor.delete({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
    await writeAudit({ action: 'TWO_FA_DISABLED', userId });
    return { enabled: false };
  },

  async changePassword(app: FastifyInstance, userId: string, current: string, next: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    if (!(await verifyPassword(current, user.passwordHash))) {
      throw new AppError('WRONG_PASSWORD', 'Mevcut şifre hatalı', 400);
    }
    const passwordHash = await hashPassword(next, app.env);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit({ action: 'PASSWORD_CHANGED', userId });
    return { changed: true };
  },
};
