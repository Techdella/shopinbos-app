import { z } from 'zod';

export const orgTypeSchema = z.enum([
  'SELLER',
  'SUPPLIER',
  'LOGISTICS',
  'SOURCING_PARTNER',
  'PLATFORM',
]);
export const membershipRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'STAFF',
  'DISPATCHER',
  'RIDER',
  'VIEWER',
]);
export const localeSchema = z.enum(['en', 'pcm', 'yo', 'ha', 'ig']);

export const meDto = z.object({
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    locale: localeSchema,
  }),
  memberships: z.array(
    z.object({
      id: z.string(),
      role: membershipRoleSchema,
      permissions: z.array(z.string()),
      organization: z.object({
        id: z.string(),
        name: z.string(),
        type: orgTypeSchema,
        kycStatus: z.string(),
      }),
      stores: z.array(
        z.object({ id: z.string(), slug: z.string(), name: z.string(), status: z.string() }),
      ),
    }),
  ),
});
export type MeDto = z.infer<typeof meDto>;

/** Permission keys (SPEC 6.1). Presets bundle them for common staff roles. */
export const PERMISSIONS = [
  'orders.read',
  'orders.write',
  'delivery.write',
  'products.read',
  'products.write',
  'customers.read',
  'chats.write',
  'marketing.write',
  'store.write',
  'money.read',
  'money.write',
  'team.write',
  'settings.write',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_PRESETS = {
  /** Owner and admin can do everything. */
  full: [...PERMISSIONS],
  /** "Orders and delivery only" staff preset. */
  ordersAndDelivery: [
    'orders.read',
    'orders.write',
    'delivery.write',
    'products.read',
    'customers.read',
  ],
} satisfies Record<string, readonly Permission[]>;
