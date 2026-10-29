import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, ok } from "@/lib/api/response";
import { getSellerAffiliates } from "@/lib/affiliates";
import { DEFAULT_COMMISSION_RATE, affiliateCode, cleanAffiliateCode, cleanAffiliatePayday } from "@shared/affiliates";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Add the creator's name").max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email("That email doesn't look right").max(200).optional().nullable().or(z.literal("")),
  code: z.string().trim().max(32).optional().nullable(),
  commissionRate: z.number().min(1, "Commission must be at least 1%").max(50, "Commission can be at most 50%").optional(),
});

const PaydaySchema = z.object({
  schedule: z.enum(["weekly", "monthly", "agreed"]),
  day: z.number().int().min(0).max(28).optional(),
});

async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, slug: true, customDomain: true } });
}

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await getSellerAffiliates(store));
});

export const POST = withSeller(async (req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");

  const taken = (await db.affiliate.findMany({ where: { storeId: store.id }, select: { code: true } })).map((row) => row.code);
  let code = affiliateCode(parsed.data.name, taken);
  if (parsed.data.code) {
    const wanted = cleanAffiliateCode(parsed.data.code);
    if (!wanted) return apiError("BAD_REQUEST", "Codes use letters, numbers, - and _ (2 to 32 characters)");
    if (taken.includes(wanted)) return apiError("CONFLICT", "Another creator already has that code");
    code = wanted;
  }

  const affiliate = await db.affiliate.create({
    data: {
      storeId: store.id,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      code,
      commissionRate: parsed.data.commissionRate ?? DEFAULT_COMMISSION_RATE,
    },
  });
  return created(affiliate);
});

// PATCH /api/app/affiliates { schedule, day }: when the seller pays their creators. Their choice, not Shopinbos's.
export const PATCH = withSeller(async (req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = PaydaySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose when you pay your creators");
  const payday = cleanAffiliatePayday(parsed.data.schedule, parsed.data.day);
  await db.store.update({ where: { id: store.id }, data: { affiliatePaySchedule: payday.schedule, affiliatePayDay: payday.day } });
  return ok(payday);
});
