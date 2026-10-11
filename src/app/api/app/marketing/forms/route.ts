import type { Prisma } from "@prisma/client";
import { created } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { FormSchema } from "../schemas";

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
      popupConfig: (input.isPopup ? input.popupConfig : {}) as Prisma.InputJsonValue,
      actions: [{ type: "add_subscriber" }] as Prisma.InputJsonValue,
    },
  });
  return created(form);
});
