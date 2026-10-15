import "server-only";

import { db } from "@/lib/db/client";
import { buildPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { sendEmail } from "@/lib/notifications/resend";
import { supportInbox } from "@/lib/support/email.server";
import { appOrigin } from "@/lib/ads";
import { PACKAGING_SERVICE_LABEL, type PackagingRequestInput } from "@shared/packaging-requests";

// "Make my packaging for me": the seller sends what they need; the Shopinbos team (later, branding partners)
// picks it up at /admin/packaging-requests and replies with a quote.

export async function createPackagingRequest(input: { storeId: string; userId: string; email: string | null; request: PackagingRequestInput }) {
  const { designId, deadline, ...rest } = input.request;
  const design = designId ? await db.printDesign.findFirst({ where: { id: designId, storeId: input.storeId }, select: { id: true } }) : null;
  const row = await db.packagingRequest.create({
    data: {
      ...rest,
      contactEmail: rest.contactEmail ?? input.email,
      deadline: deadline ? new Date(deadline) : null,
      designId: design?.id ?? null,
      storeId: input.storeId,
      userId: input.userId,
    },
  });
  await notifyTeam(row.id).catch((error) => console.error("[packaging-requests] team email failed", error));
  return row;
}

async function notifyTeam(id: string) {
  const row = await db.packagingRequest.findUnique({ where: { id } });
  if (!row) return;
  const store = await db.store.findUnique({ where: { id: row.storeId }, select: { name: true, slug: true } });
  const lines = [
    `Store: ${store?.name ?? "?"} (${store?.slug ?? "?"})`,
    `Contact: ${row.contactName} · ${row.contactPhone}${row.contactEmail ? ` · ${row.contactEmail}` : ""}`,
    `Product: ${row.productName} (${row.productType})`,
    `Pack: ${row.packType}${row.size ? ` · ${row.size}` : ""} · ${row.quantity.toLocaleString("en-NG")} pieces`,
    row.services.length ? `Wants: ${row.services.map((service) => PACKAGING_SERVICE_LABEL[service as keyof typeof PACKAGING_SERVICE_LABEL] ?? service).join(", ")}` : "",
    row.budget ? `Budget: ₦${row.budget.toLocaleString("en-NG")}` : "",
    row.deadline ? `Needed by: ${row.deadline.toISOString().slice(0, 10)}` : "",
    `Details: ${row.details}`,
    row.referenceUrls.length ? `References: ${row.referenceUrls.join(" ")}` : "",
  ].filter(Boolean);
  const body = buildPlatformEmail({
    kind: "transactional",
    eyebrow: "Packaging request",
    heading: `${store?.name ?? row.contactName} wants packaging for ${row.productName}`,
    preheader: `${row.quantity} × ${row.packType}`,
    bodyHtml: html.list(lines),
    cta: { label: "Open packaging requests", url: `${appOrigin()}/admin/packaging-requests` },
    reason: "you're on the Shopinbos branding team",
  }).html;
  await sendEmail({ to: [process.env.PACKAGING_TEAM_EMAIL?.trim() || supportInbox()], subject: `Packaging request: ${row.productName} (${store?.name ?? "store"})`, html: body, replyTo: row.contactEmail ?? undefined });
}
