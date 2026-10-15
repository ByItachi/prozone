import { z } from 'zod';

export const idSchema = z.string().uuid({ message: 'Geçersiz id' });

// ─── Auth ───
export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'İsim en az 2 karakter olmalı').max(60),
    surname: z.string().trim().min(2, 'Soyisim en az 2 karakter olmalı').max(60),
    username: z
      .string()
      .trim()
      .min(3, 'Kullanıcı adı en az 3 karakter olmalı')
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/, 'Kullanıcı adı yalnızca harf, rakam ve alt çizgi içerebilir'),
    email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin'),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{7,20}$/, 'Geçerli bir telefon girin')
      .optional()
      .nullable()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Şifre en az 8 karakter olmalı')
      .max(128)
      .regex(/[a-z]/, 'Şifre en az bir küçük harf içermeli')
      .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermeli')
      .regex(/[0-9]/, 'Şifre en az bir rakam içermeli'),
    passwordConfirmation: z.string(),
    terms: z.boolean().refine((v) => v === true, 'Kullanım koşullarını kabul etmelisiniz'),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'Şifreler eşleşmiyor',
    path: ['passwordConfirmation'],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(2, 'E-posta veya kullanıcı adı girin').max(150),
  password: z.string().min(1, 'Şifre gereklidir'),
  rememberMe: z.boolean().optional().default(false),
  totpCode: z.string().regex(/^\d{6}$/, '6 haneli doğrulama kodu girin').optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'Şifreler eşleşmiyor',
    path: ['passwordConfirmation'],
  });

export const enable2FASchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const disable2FASchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const refreshSchema = z.object({});

// ─── User profile ───
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  surname: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/).optional().nullable(),
  language: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(60).optional(),
  notificationEmail: z.boolean().optional(),
  notificationWeb: z.boolean().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .max(128)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    newPasswordConfirmation: z.string(),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirmation, {
    message: 'Şifreler eşleşmiyor',
    path: ['newPasswordConfirmation'],
  });

// ─── Orders ───
export const createOrderSchema = z.object({
  productId: z.string().uuid(),
  billingCycle: z.enum(['monthly', 'yearly', 'one_time']).default('monthly'),
  configuration: z.record(z.string(), z.any()).optional().default({}),
  couponCode: z.string().trim().min(3).max(30).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// ─── Payments ───
export const depositSchema = z.object({
  amount: z.number().positive().max(100000, 'Maksimum tutar aşıldı'),
  provider: z.enum(['stripe', 'paypal', 'iyzico', 'paytr', 'crypto', 'mock', 'manual']),
  currency: z.string().length(3).default('USD'),
});

export const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(5),
  token: z.string().optional(),
});

export const payOrderSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(['wallet', 'stripe', 'paypal', 'mock', 'paytr']),
});

// ─── Wallet ───
export const walletAdjustSchema = z.object({
  amount: z.number().min(-100000).max(100000),
  reason: z.string().trim().min(3).max(300),
  type: z.enum(['ADJUSTMENT', 'REFUND']).default('ADJUSTMENT'),
});

// ─── Tickets ───
export const createTicketSchema = z.object({
  subject: z.string().trim().min(5, 'Konu en az 5 karakter').max(200),
  category: z.string().trim().min(2).max(60),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  message: z.string().trim().min(5, 'Mesaj en az 5 karakter').max(10000),
});

export const ticketReplySchema = z.object({
  message: z.string().trim().min(1).max(10000),
});

// ─── Notifications ───
export const markNotificationsSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});

// ─── Admin ───
export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  surname: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING']).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'USER']).optional(),
  emailVerified: z.boolean().optional(),
});

export const adminWalletAdjustSchema = walletAdjustSchema.extend({
  userId: z.string().uuid(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(3).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug yalnızca küçük harf, rakam ve tire olmalı'),
  description: z.string().trim().max(5000).default(''),
  category: z.string().trim().min(2).max(60),
  price: z.number().nonnegative(),
  setupFee: z.number().nonnegative().default(0),
  monthlyPrice: z.number().nonnegative().default(0),
  yearlyPrice: z.number().nonnegative().default(0),
  features: z.array(z.string()).default([]),
  limits: z.record(z.string(), z.any()).default({}),
  currency: z.string().length(3).default('USD'),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  metadata: z.record(z.string(), z.any()).default({}),
});

export const updateProductSchema = createProductSchema
  .partial()
  .extend({ id: z.string().uuid() });

export const adminTicketUpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(3).max(10000),
  type: z.enum(['INFO', 'WARNING', 'MAINTENANCE', 'UPDATE', 'PROMO']).default('INFO'),
  active: z.boolean().default(true),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
});

export const couponSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Z0-9-]+$/),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).default(0),
  maxUses: z.number().int().min(1).default(1),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
});

export const systemSettingSchema = z.object({
  key: z.string().trim().min(2).max(100),
  value: z.string().trim().max(10000),
  isPublic: z.boolean().default(false),
  type: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(150).optional(),
  status: z.string().optional(),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;