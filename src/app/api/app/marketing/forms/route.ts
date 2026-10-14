import type { Prisma } from "@prisma/client";
import { created } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { prepareFormReward } from "@/lib/marketing/popup-rewards.server";
import { FormSchema } from "../schemas";
import { storedPopupConfig } from "./stored";

export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, FormSchema);
  const form = await db.storeForm.create({
    data: {
      storeId: store.id,
      name: input.name,
      type: input.type,
      isPopup: input.isPopup,
      active: input.active,
      fields: input.fields as unknown as Prisma.InputJsonValue,
      design: input.design as Prisma.InputJsonValue,
      popupConfig: storedPopupConfig(input, null) as Prisma.InputJsonValue,
      actions: [{ type: "add_subscriber" }] as Prisma.InputJsonValue,
    },
  });
  if (!input.popupConfig.reward) return created(form);
  // The shared code (if any) is marked with the form's id, so the form has to exist first.
  try {
    const reward = await prepareFormReward(store.id, form, input.popupConfig.reward, null);
    return created(await db.storeForm.update({ where: { id: form.id }, data: { popupConfig: storedPopupConfig(input, reward) as Prisma.InputJsonValue } }));
  } catch (error) {
    await db.storeForm.delete({ where: { id: form.id } }).catch(() => null);
    throw error;
  }
});
