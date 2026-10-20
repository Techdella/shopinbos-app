"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { logisticsLimits, planKeyFor, PLAN_NAMES, cheapestPlanWhere } from "@shared/plans";

// Delivery partner settings that come with the October 2026 plans: taking pay-on-delivery jobs, pickup points
// (Free 3, Plus 20, Pro unlimited) and private rate cards for particular sellers or suppliers (Plus and up).

async function partnerActor() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const [partner, dbUser] = await Promise.all([
    db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, slug: true } }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  if (!partner) redirect("/logistics/profile");
  return { user, partner, limits: logisticsLimits(planKeyFor("logistics_partner", dbUser?.aiCredits)) };
}

const back = (path: string, query: Record<string, string>) => `${path}?${new URLSearchParams(query).toString()}`;
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function setAcceptsCod(formData: FormData) {
  const { partner } = await partnerActor();
  await db.logisticsPartner.update({ where: { id: partner.id }, data: { acceptsCod: formData.get("acceptsCod") === "on" } });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  revalidatePath("/logistics/pricing");
  redirect(back("/logistics/pricing", { saved: "1" }));
}

const PickupPointSchema = z.object({
  name: z.string().min(2, "Give the pickup point a name.").max(80),
  address: z.string().min(4, "Enter the address.").max(200),
  city: z.string().min(2, "Enter the city.").max(60),
  state: z.string().min(2, "Enter the state.").max(60),
  phone: z.string().max(30).optional(),
  hours: z.string().max(80).optional(),
});

export async function addPickupPoint(formData: FormData) {
  const { partner, limits } = await partnerActor();
  const parsed = PickupPointSchema.safeParse({
    name: text(formData, "name"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    phone: text(formData, "phone") || undefined,
    hours: text(formData, "hours") || undefined,
  });
  if (!parsed.success) redirect(back("/logistics/pickup-points", { error: parsed.error.issues[0]?.message ?? "Check the pickup point." }));
  const count = await db.logisticsPickupPoint.count({ where: { logisticsPartnerId: partner.id, active: true } });
  if (limits.pickupPoints !== null && count >= limits.pickupPoints) {
    const plan = cheapestPlanWhere("logistics_partner", (key) => {
      const next = logisticsLimits(key).pickupPoints;
      return next === null || next > count;
    });
    redirect(back("/logistics/pickup-points", { error: `Your plan includes ${limits.pickupPoints} pickup points.${plan ? ` Upgrade to ${PLAN_NAMES[plan]} to add more.` : ""}` }));
  }
  await db.logisticsPickupPoint.create({ data: { logisticsPartnerId: partner.id, ...parsed.data } });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  revalidatePath("/logistics/pickup-points");
  redirect(back("/logistics/pickup-points", { saved: "1" }));
}

export async function removePickupPoint(formData: FormData) {
  const { partner } = await partnerActor();
  await db.logisticsPickupPoint.deleteMany({ where: { id: text(formData, "id"), logisticsPartnerId: partner.id } });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  revalidatePath("/logistics/pickup-points");
  redirect(back("/logistics/pickup-points", { saved: "1" }));
}

export async function saveRateCard(formData: FormData) {
  const { partner, limits } = await partnerActor();
  if (!limits.privateRateCards) redirect(back("/logistics/pricing", { error: "Private rate cards come with the Logistics Plus plan." }));
  const email = text(formData, "email").toLowerCase();
  const price = Math.round(Number(text(formData, "price")));
  const label = text(formData, "label").slice(0, 80) || "Private rate";
  const states = text(formData, "states").split(",").map((state) => state.trim()).filter((state) => state.length >= 2).slice(0, 40);
  if (!Number.isFinite(price) || price < 1 || price > 1_000_000) redirect(back("/logistics/pricing", { error: "Enter a price between ₦1 and ₦1,000,000." }));
  const customer = email ? await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, role: { in: ["seller", "supplier"] } }, select: { id: true } }) : null;
  if (!customer) redirect(back("/logistics/pricing", { error: "We couldn't find a seller or supplier with that email." }));
  const data = { label, price, states, notes: text(formData, "notes").slice(0, 300) || null, active: true };
  await db.privateRateCard.upsert({
    where: { logisticsPartnerId_customerUserId: { logisticsPartnerId: partner.id, customerUserId: customer.id } },
    create: { logisticsPartnerId: partner.id, customerUserId: customer.id, ...data },
    update: data,
  });
  revalidatePath("/logistics/pricing");
  redirect(back("/logistics/pricing", { saved: "1" }));
}

export async function removeRateCard(formData: FormData) {
  const { partner } = await partnerActor();
  await db.privateRateCard.deleteMany({ where: { id: text(formData, "id"), logisticsPartnerId: partner.id } });
  revalidatePath("/logistics/pricing");
  redirect(back("/logistics/pricing", { saved: "1" }));
}
