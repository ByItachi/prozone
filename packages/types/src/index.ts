// ─── Enums ───
export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'USER';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING';

export type ServiceStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';

export type OrderStatus =
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED';

export type PaymentProvider =
  | 'wallet'
  | 'balance'
  | 'stripe'
  | 'paypal'
  | 'iyzico'
  | 'paytr'
  | 'crypto'
  | 'mock'
  | 'manual';

export type TransactionType = 'DEPOSIT' | 'PURCHASE' | 'REFUND' | 'WITHDRAW' | 'ADJUSTMENT';

export type InvoiceStatus = 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type NotificationType =
  | 'ORDER_CREATED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'SERVICE_ACTIVATED'
  | 'SERVICE_EXPIRING'
  | 'SERVICE_SUSPENDED'
  | 'TICKET_RESPONSE'
  | 'SECURITY_ALERT'
  | 'WALLET'
  | 'ANNOUNCEMENT'
  | 'SYSTEM';

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'EMAIL_VERIFIED'
  | 'TWO_FA_ENABLED'
  | 'TWO_FA_DISABLED'
  | 'USER_SUSPENDED'
  | 'USER_BANNED'
  | 'USER_UNBANNED'
  | 'ORDER_CREATED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_COMPLETED'
  | 'PAYMENT_FAILED'
  | 'REFUND_CREATED'
  | 'SERVICE_ACTIVATED'
  | 'SERVICE_SUSPENDED'
  | 'SERVICE_CANCELLED'
  | 'WALLET_ADJUSTED'
  | 'INVOICE_ISSUED'
  | 'TICKET_CREATED'
  | 'TICKET_STATUS_CHANGED'
  | 'SETTINGS_CHANGED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'ADMIN_ACTION'
  | 'EMAIL_SENT'
  | 'PASSWORD_RESET'
  | 'LOGIN_FAILED';

// ─── API envelope ───
export interface ApiSuccess<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: string;
  data: null;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// ─── DTOs ───
export interface AuthUser {
  id: string;
  name: string;
  surname: string;
  username: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: RoleName;
  status: UserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface WalletDto {
  id: string;
  balance: number;
  currency: string;
}

export interface StatsDto {
  activeServices: number;
  totalOrders: number;
  pendingOrders: number;
  accountBalance: number;
  openTickets: number;
}

export interface AuthTokens {
  accessToken: string;
  user: AuthUser;
}

export interface LoginResponse {
  user: AuthUser;
  requires2FA: boolean;
  tempToken?: string;
}

export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  setupFee: number;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  limits: Record<string, number | string | boolean>;
  active: boolean;
  featured: boolean;
}

export interface ServiceDto {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ServiceStatus;
  price: number;
  billingCycle: string;
  createdAt: string;
  renewalDate: string;
  configuration: Record<string, unknown>;
  metadata: Record<string, unknown>;
}