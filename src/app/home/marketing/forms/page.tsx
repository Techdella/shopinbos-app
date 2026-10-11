import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { FormsManager, type ManagedForm } from "./FormsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forms and popups" };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export default async function FormsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const rows = store ? await db.storeForm.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 100 }) : [];

  const forms: ManagedForm[] = rows.map((row) => {
    const popup = record(row.popupConfig);
    return {
      id: row.id,
      name: row.name,
      purpose: row.type,
      isPopup: row.isPopup,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      fields: (Array.isArray(row.fields) ? row.fields : []).map((raw, index) => {
        const field = record(raw);
        return {
          key: String(field.key ?? field.id ?? `field_${index}`),
          type: String(field.type ?? "text"),
          label: String(field.label ?? ""),
          required: Boolean(field.required),
        };
      }),
      popup: row.isPopup
        ? {
            timing: popup.timing === "delay" || popup.timing === "exit_intent" ? popup.timing : "immediate",
            delaySeconds: typeof popup.delaySeconds === "number" ? popup.delaySeconds : 5,
            pages: popup.pages === "home" || popup.pages === "product" ? popup.pages : "all",
            frequency: popup.frequency === "session" || popup.frequency === "always" ? popup.frequency : "once",
            devices: Array.isArray(popup.devices) ? popup.devices.filter((d): d is "mobile" | "desktop" => d === "mobile" || d === "desktop") : ["mobile", "desktop"],
            afterSubmit: popup.afterSubmit === "message" || popup.afterSubmit === "notify" || popup.afterSubmit === "redirect" ? popup.afterSubmit : "add_subscriber",
            redirectUrl: typeof popup.redirectUrl === "string" ? popup.redirectUrl : "",
            message: typeof popup.message === "string" ? popup.message : "",
          }
        : null,
    };
  });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Forms and popups"
      sub="Collect emails, questions and leads from your store."
      actions={<PillLink href="/home/forms" icon="message">See what people sent</PillLink>}
    >
      <FormsManager forms={forms} />
    </SellerPage>
  );
}
