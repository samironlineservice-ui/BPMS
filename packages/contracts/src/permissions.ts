// Ruxsatlar katalogi — yagona manba (seed, server guard'lari va UI shu yerdan oladi).
// `sensitive: true` — step-up auth va/yoki tasdiq talab qilinadi.

export interface PermissionDef {
  key: string;
  module: string;
  description: string;
  sensitive?: boolean;
}

const p = (module: string, action: string, description: string, sensitive = false): PermissionDef => ({
  key: `${module}:${action}`,
  module,
  description,
  sensitive,
});

export const PERMISSIONS = [
  p('dashboard', 'read', "Dashboard'ni ko'rish"),

  p('clients', 'read', "Mijozlarni ko'rish"),
  p('clients', 'create', "Mijoz qo'shish"),
  p('clients', 'update', 'Mijozni tahrirlash'),
  p('clients', 'archive', 'Mijozni arxivlash'),
  p('clients', 'export', 'Mijozlarni eksport qilish', true),
  p('clients', 'read_sensitive', "Maxfiy ma'lumotlarni (PINFL, bank) ko'rish", true),

  p('projects', 'read', "Loyihalarni ko'rish"),
  p('projects', 'create', "Loyiha qo'shish"),
  p('projects', 'update', 'Loyihani tahrirlash'),
  p('projects', 'archive', 'Loyihani arxivlash'),
  p('projects', 'manage_members', "Loyiha a'zolarini boshqarish"),

  p('plans', 'read', "Tariflarni ko'rish"),
  p('plans', 'manage', 'Tarif va narxlarni boshqarish', true),

  p('subscriptions', 'read', "Obunalarni ko'rish"),
  p('subscriptions', 'create', 'Obuna yaratish'),
  p('subscriptions', 'update', "Obunani o'zgartirish"),
  p('subscriptions', 'suspend', "Obunani to'xtatish", true),
  p('subscriptions', 'cancel', 'Obunani bekor qilish', true),

  p('invoices', 'read', "Invoice'larni ko'rish"),
  p('invoices', 'create', 'Invoice yaratish'),
  p('invoices', 'issue', 'Invoice chiqarish (finalizatsiya)'),
  p('invoices', 'void', 'Invoice bekor qilish (void)', true),
  p('invoices', 'export', "Invoice'larni eksport qilish"),

  p('payments', 'read', "To'lovlarni ko'rish"),
  p('payments', 'record', "To'lov kiritish"),
  p('payments', 'allocate', "To'lovni invoice'larga taqsimlash"),
  p('payments', 'approve', "Qo'lda kiritilgan to'lovni tasdiqlash", true),
  p('payments', 'export', "To'lovlarni eksport qilish"),
  p('gateways', 'read', "Onlayn to'lov tizimlari: sozlama va tranzaksiyalarni ko'rish"),
  p('gateways', 'configure', "Onlayn to'lov tizimlari kalitlarini sozlash", true),

  p('refunds', 'request', "Refund so'rash"),
  p('refunds', 'approve', 'Refundni tasdiqlash', true),
  p('credit_notes', 'request', "Credit note so'rash"),
  p('credit_notes', 'approve', 'Credit note tasdiqlash', true),

  p('finance', 'read', "Moliyani ko'rish (ledger, akt-sverka)"),
  p('finance', 'manage_fx', 'Valyuta kurslarini kiritish', true),
  p('finance', 'close_period', 'Oyni yopish va FX qayta baholash', true),

  p('analytics', 'read', "Hisobotlarni ko'rish"),
  p('analytics', 'export', 'Hisobotlarni eksport qilish'),

  p('devices', 'read', "Qurilmalarni ko'rish"),
  p('devices', 'create', "Qurilma qo'shish"),
  p('devices', 'update', 'Qurilmani tahrirlash'),
  p('devices', 'decommission', "Qurilmani foydalanishdan chiqarish", true),

  p('releases', 'read', "Versiyalarni ko'rish"),
  p('releases', 'create', 'Versiya yaratish'),
  p('releases', 'publish', 'Versiyani chiqarish', true),
  p('releases', 'revoke', 'Versiyani bekor qilish', true),

  p('deployments', 'read', "Deploymentlarni ko'rish"),
  p('deployments', 'create', 'Deployment yaratish'),
  p('deployments', 'update', 'Deployment natijasini belgilash'),
  p('deployments', 'approve', 'Prod deploymentni tasdiqlash', true),

  p('files', 'read', "Fayllarni ko'rish"),
  p('files', 'upload', 'Fayl yuklash'),
  p('files', 'delete', "Faylni o'chirish", true),

  p('notifications', 'manage_templates', 'Bildirishnoma shablonlarini boshqarish'),

  p('users', 'read', "Foydalanuvchilarni ko'rish"),
  p('users', 'invite', 'Foydalanuvchi taklif qilish', true),
  p('users', 'update', 'Foydalanuvchini tahrirlash'),
  p('users', 'deactivate', "Foydalanuvchini o'chirish (deaktivatsiya)", true),
  p('users', 'manage_roles', 'Rollar va ruxsatlarni berish', true),

  p('portal_users', 'read', "Portal foydalanuvchilarini ko'rish"),
  p('portal_users', 'invite', 'Portal foydalanuvchisini taklif qilish'),
  p('portal_users', 'deactivate', "Portal foydalanuvchisini o'chirish"),

  p('requests', 'read', "Mijoz murojaatlarini ko'rish"),
  p('requests', 'manage', "Murojaatlarga javob berish, holat va mas'ulni o'zgartirish"),

  p('audit', 'read', "Audit logni ko'rish"),
  p('audit', 'export', 'Audit logni eksport qilish', true),
  p('audit', 'verify', 'Audit yaxlitligini tekshirish'),

  p('settings', 'read', "Sozlamalarni ko'rish"),
  p('settings', 'manage', "Sozlamalarni o'zgartirish", true),

  p('approvals', 'read', "Tasdiq so'rovlarini ko'rish"),
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS = PERMISSIONS.map((x) => x.key) as PermissionKey[];
export const isPermissionKey = (k: string): k is PermissionKey => (PERMISSION_KEYS as string[]).includes(k);

const readAll = PERMISSION_KEYS.filter((k) => k.endsWith(':read'));

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}

/** Tizim rollari (seed). Custom rollarni rahbar qo'shishi mumkin. */
export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    key: 'director',
    name: 'Rahbar',
    description: "Barcha tasdiqlar va ruxsat berish; o'zida bor ruxsatlarni menejerga bera oladi",
    permissions: PERMISSION_KEYS,
  },
  {
    key: 'super_admin',
    name: 'Super admin',
    description: 'Texnik administrator (break-glass)',
    permissions: PERMISSION_KEYS,
  },
  {
    key: 'manager',
    name: 'Menejer',
    description: "Mijozlar, loyihalar, obunalar, qurilmalar va deploymentlar; tasdiqlash — faqat rahbar ruxsati bilan",
    permissions: [
      ...readAll,
      'clients:create', 'clients:update', 'clients:archive',
      'projects:create', 'projects:update', 'projects:manage_members',
      'subscriptions:create', 'subscriptions:update',
      'invoices:create',
      'devices:create', 'devices:update',
      'releases:create',
      'deployments:create', 'deployments:update',
      'files:upload',
      'portal_users:invite',
      'requests:manage',
    ] as PermissionKey[],
  },
  {
    key: 'accountant',
    name: 'Buxgalter',
    description: "To'lov kiritish va taqsimlash, invoice'lar, kurslar; tasdiqlash — rahbar",
    permissions: [
      'dashboard:read', 'clients:read', 'projects:read', 'plans:read', 'subscriptions:read',
      'invoices:read', 'invoices:create', 'invoices:issue', 'invoices:export',
      'payments:read', 'payments:record', 'payments:allocate', 'payments:export', 'gateways:read',
      'refunds:request', 'credit_notes:request',
      'finance:read', 'finance:manage_fx',
      'analytics:read', 'analytics:export', 'files:read', 'files:upload', 'approvals:read',
      'requests:read', 'requests:manage',
    ] as PermissionKey[],
  },
  {
    key: 'support',
    name: 'Texnik yordam',
    description: 'Qurilmalar, versiyalar va deploymentlar natijasi',
    permissions: [
      'dashboard:read', 'clients:read', 'projects:read', 'devices:read', 'devices:update',
      'releases:read', 'deployments:read', 'deployments:update', 'files:read', 'files:upload',
      'requests:read', 'requests:manage',
    ] as PermissionKey[],
  },
  {
    key: 'auditor',
    name: 'Auditor',
    description: "Hammasini faqat o'qish + audit eksporti va tekshiruvi",
    permissions: [...readAll, 'audit:export', 'audit:verify'] as PermissionKey[],
  },
];

/** Tasdiqlash siyosatlari (seed). */
export const APPROVAL_POLICIES = [
  { key: 'deployments.production', description: 'Prod deployment', approverPermission: 'deployments:approve' },
  { key: 'invoices.void', description: 'Invoice void', approverPermission: 'invoices:void' },
  { key: 'refunds', description: 'Refund', approverPermission: 'refunds:approve' },
  { key: 'credit_notes', description: 'Credit note', approverPermission: 'credit_notes:approve' },
] as const;
