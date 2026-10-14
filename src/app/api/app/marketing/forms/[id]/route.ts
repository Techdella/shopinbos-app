import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { readPopupConfig } from "@/lib/marketing/forms";
import { prepareFormReward } from "@/lib/marketing/popup-rewards.server";
import { MarketingError } from "@/lib/marketing/segments";
import { FormSchema } from "../../schemas";
import { storedPopupConfig } from "../stored";

async function own(storeId: string, id: string) {
  const form = await db.storeForm.findFirst({ where: { id, storeId }, select: { id: true, popupConfig: true } });
  if (!form) throw new MarketingError("Form not found");
  return form;
}

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  const existing = await own(store.id, params.id);
  const input = await readBody(req, z.union([z.object({ active: z.boolean() }).strict(), FormSchema]));
  if (!("name" in input)) return ok(await db.storeForm.update({ where: { id: params.id }, data: { active: input.active } }));
  const reward = await prepareFormReward(store.id, { id: params.id, name: input.name }, input.popupConfig.reward ?? null, readPopupConfig(existing.popupConfig).reward);
  return ok(
    await db.storeForm.update({
      where: { id: params.id },
      data: {
        name: input.name,
        type: input.type,
        isPopup: input.isPopup,
        active: input.active,
        fields: input.fields as unknown as Prisma.InputJsonValue,
        design: input.design as Prisma.InputJsonValue,
        popupConfig: storedPopupConfig(input, reward) as Prisma.InputJsonValue,
      },
    }),
  );
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  await own(store.id, params.id);
  await db.storeForm.delete({ where: { id: params.id } });
  return ok({ deleted: true });
});
