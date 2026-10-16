export interface ProductPrice {
  cycle: 'one_time' | 'monthly' | 'yearly';
  amount: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  setupFee: number;
  currency: string;
  features: string[];
  limits: Record<string, unknown>;
  metadata: Record<string, unknown>;
  active: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  prices?: ProductPrice[];
}

export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  config?: unknown;
  product?: { slug: string };
}

export interface Payment {
  id: string;
  provider: string;
  providerRef: string | null;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  billingCycle: string;
  configuration?: unknown;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments?: Payment[];
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  price: number;
  currency: string;
  billingCycle: string;
  configuration?: unknown;
  startedAt: string | null;
  renewalDate: string | null;
  cancelledAt: string | null;
  expirationReason?: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  balance: number;
  currency: string;
  totalDeposited: number;
  minDeposit: number;
  unlocked: boolean;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  order?: unknown;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: string;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages?: (TicketMessage & { sender?: unknown })[];
}

export interface TicketMessage {
  id: string;
  body: string;
  senderId: string | null;
  isStaff: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}