import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { MarketingError } from "@/lib/marketing/segments";
import { FormSchema } from "../../schemas";

async function own(storeId: string, id: string) {
  const form = await db.storeForm.findFirst({ where: { id, storeId }, select: { id: true } });
  if (!form) throw new MarketingError("Form not found");
}

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  await own(store.id, params.id);
  const input = await readBody(req, z.union([z.object({ active: z.boolean() }).strict(), FormSchema]));
  if (!("name" in input)) return ok(await db.storeForm.update({ where: { id: params.id }, data: { active: input.active } }));
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
        popupConfig: (input.isPopup ? input.popupConfig : {}) as Prisma.InputJsonValue,
      },
    }),
  );
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  await own(store.id, params.id);
  await db.storeForm.delete({ where: { id: params.id } });
  return ok({ deleted: true });
});
