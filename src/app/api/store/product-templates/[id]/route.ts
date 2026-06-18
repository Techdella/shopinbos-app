import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { ProductPageTemplateUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

async function getOwnedTemplate(templateId: string, userId: string) {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return null;
  return db.productPageTemplate.findUnique({ where: { id: templateId, storeId: store.id } });
}

export const GET = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const template = await getOwnedTemplate(params.id, user.id);
  if (!template) return apiError("NOT_FOUND", "Template not found", 404);
  return ok(template);
});

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const template = await getOwnedTemplate(params.id, user.id);
  if (!template) return apiError("NOT_FOUND", "Template not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = ProductPageTemplateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (parsed.data.isDefault) {
    await db.productPageTemplate.updateMany({
      where: { storeId: template.storeId, isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    });
  }

  const updated = await db.productPageTemplate.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return ok(updated);
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const template = await getOwnedTemplate(params.id, user.id);
  if (!template) return apiError("NOT_FOUND", "Template not found", 404);

  await db.productPageTemplate.delete({ where: { id: params.id } });
  return noContent();
});
