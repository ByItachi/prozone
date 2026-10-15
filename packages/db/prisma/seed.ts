import { PrismaClient, RoleName } from '@prisma/client';
import argon2 from 'argon2';
import { createLogger } from '@novapanel/logger';

const prisma = new PrismaClient();
const log = createLogger('seed');

const ROLE_IDS = {
  SUPER_ADMIN: 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  ADMIN: 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  SUPPORT: 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  FINANCE: 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
  USER: 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
} as const;

const PERMISSIONS = [
  // users
  'users.read', 'users.write', 'users.delete',
  // orders
  'orders.read', 'orders.write',
  // products
  'products.read', 'products.write', 'products.delete',
  // services
  'services.read', 'services.write', 'services.cancel',
  // payments
  'payments.read', 'payments.refund',
  // wallet
  'wallets.read', 'wallets.adjust',
  // invoices
  'invoices.read', 'invoices.write',
  // tickets
  'tickets.read', 'tickets.write',
  // notifications & announcements
  'notifications.send', 'announcements.write',
  // coupons
  'coupons.read', 'coupons.write',
  // system
  'settings.read', 'settings.write', 'logs.read', 'audit.read',
  // platform admin
  'sessions.read', 'sessions.revoke',
  'access.read', 'access.write', 'access.revoke',
  'md5.read', 'md5.write',
  'notes.write', 'roles.read', 'roles.write',
  'analytics.read', 'export.run',
  'templates.read', 'templates.write',
  // dashboard
  'dashboard.read',
] as const;

const ROLE_PERMISSIONS: Record<keyof typeof ROLE_IDS, string[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  ADMIN: [
    'users.read', 'users.write', 'users.delete',
    'sessions.read', 'sessions.revoke', 'access.read', 'access.write', 'access.revoke', 'md5.read', 'md5.write', 'notes.write', 'roles.read', 'analytics.read', 'export.run',
    'orders.read', 'orders.write',
    'products.read', 'products.write',
    'services.read', 'services.write', 'services.cancel',
    'payments.read', 'payments.refund',
    'wallets.read', 'wallets.adjust',
    'invoices.read',
    'tickets.read', 'tickets.write',
    'notifications.send', 'announcements.write',
    'coupons.read', 'coupons.write',
    'settings.read',
    'logs.read',
    'dashboard.read',
  ],
  SUPPORT: [
    'users.read',
    'orders.read',
    'services.read',
    'tickets.read', 'tickets.write',
    'dashboard.read',
  ],
  FINANCE: [
    'users.read',
    'orders.read',
    'payments.read', 'payments.refund',
    'wallets.read', 'wallets.adjust',
    'invoices.read',
    'dashboard.read',
  ],
  USER: ['dashboard.read'],
};

const PRODUCTS = [
  {
    name: 'Starter Panel',
    slug: 'starter-panel',
    category: 'Panel',
    description: 'Essential management panel for small businesses. Includes 5 users, 10 services and basic reporting.',
    price: 9.99,
    setupFee: 0,
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    features: ['5 Admin User', '10 Services', 'Basic Reports', 'Email Support', '99.9% Uptime SLA'],
    limits: { users: 5, services: 10, storageGb: 10, bandwidthGb: 100 },
  },
  {
    name: 'Professional Panel',
    slug: 'professional-panel',
    category: 'Panel',
    description: 'Advanced panel for growing teams. Unlimited services, automation and priority support.',
    price: 29.99,
    setupFee: 19.99,
    monthlyPrice: 29.99,
    yearlyPrice: 299.99,
    featured: true,
    features: ['25 Admin Users', 'Unlimited Services', 'Advanced Analytics', 'API Access', 'Priority Support', 'Custom Domain'],
    limits: { users: 25, services: 9999, storageGb: 100, bandwidthGb: 1000 },
  },
  {
    name: 'Business Panel',
    slug: 'business-panel',
    category: 'Panel',
    description: 'High-performance panel for enterprise use. Unlimited everything, guaranteed SLA.',
    price: 79.99,
    setupFee: 49.99,
    monthlyPrice: 79.99,
    yearlyPrice: 799.99,
    features: ['Unlimited Users', 'Unlimited Services', 'Custom Integrations', 'Dedicated Manager', 'SSO/SAML', '99.99% Uptime SLA'],
    limits: { users: 9999, services: 99999, storageGb: 1000, bandwidthGb: 10000 },
  },
  {
    name: 'Social Boost (Instagram)',
    slug: 'social-boost-instagram',
    category: 'Social Media',
    description: 'Automatic follower growth for your Instagram profile. Secure and fast delivery.',
    price: 4.99,
    setupFee: 0,
    monthlyPrice: 4.99,
    yearlyPrice: 49.99,
    features: ['1000+ Followers', 'Secure Delivery', 'No Password Required', '24/7 Support'],
    limits: { followers: 1000, dropGuarantee: true },
  },
  {
    name: 'Stream Package (IPTV)',
    slug: 'stream-package',
    category: 'Streaming',
    description: 'High-quality IPTV streaming package. Full HD + UHD channels.',
    price: 14.99,
    setupFee: 5.00,
    monthlyPrice: 14.99,
    yearlyPrice: 149.99,
    features: ['10000+ Channels', 'Full HD + UHD', 'Anti-Freeze', '24/7 Support'],
    limits: { connections: 1, channels: 10000 },
  },
];

async function seed() {
  log.info('Seeding database...');

  for (const [name, id] of Object.entries(ROLE_IDS)) {
    await prisma.role.upsert({
      where: { id },
      update: { name: name as RoleName },
      create: { id, name: name as RoleName, description: `${name} role` },
    });
  }

  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = ROLE_IDS[roleName as keyof typeof ROLE_IDS];
    const permissionIds = await prisma.permission.findMany({
      where: { key: { in: perms } },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((p) => ({ roleId, permissionId: p.id })),
    });
  }

  const settings = [
    { key: 'site.name', value: 'NovaPanel', type: 'string', isPublic: true },
    { key: 'site.currency', value: 'USD', type: 'string', isPublic: true },
    { key: 'site.maintenance', value: 'false', type: 'boolean', isPublic: true },
    { key: 'registration.enabled', value: 'true', type: 'boolean', isPublic: false },
    { key: 'payments.min_deposit', value: '5', type: 'number', isPublic: false },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }

  const passwordHash = await argon2.hash('Admin1234!');

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@novapanel.dev';
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System',
      surname: 'Admin',
      username: 'admin',
      email: adminEmail,
      emailVerified: true,
      passwordHash,
      roleId: ROLE_IDS.SUPER_ADMIN,
      status: 'ACTIVE',
    },
    include: { wallet: true },
  });

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: { currency: 'USD' },
    create: { userId: admin.id, balance: 0, currency: 'USD' },
  });

  for (const p of PRODUCTS) {
    const { monthlyPrice, yearlyPrice, ...rest } = p;
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { ...rest, price: p.price },
      create: { ...rest, price: p.price },
    });

    const priceData = [
      { cycle: 'one_time' as const, amount: p.price },
      { cycle: 'monthly' as const, amount: monthlyPrice },
      { cycle: 'yearly' as const, amount: yearlyPrice },
    ];

    for (const price of priceData) {
      await prisma.productPrice.upsert({
        where: { productId_cycle: { productId: product.id, cycle: price.cycle } },
        update: { amount: price.amount },
        create: {
          productId: product.id,
          cycle: price.cycle,
          amount: price.amount,
          currency: 'USD',
        },
      });
    }
  }

  log.info('Seeding complete.');
}

seed()
  .catch((e) => {
    log.error({ err: e }, 'Seed failed');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());