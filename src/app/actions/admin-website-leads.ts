"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { createHash, randomUUID } from "node:crypto";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WebsiteLeadInput } from "@/lib/website-leads/pure";
import { saveWebsiteLead, updateWebsiteLead } from "@/lib/website-leads/service.server";
import { matchLeadsToExistingUsers } from "@/lib/lead-growth/service.server";
import { db } from "@/lib/db/client";
import { conversationFromLead } from "@/lib/support/service.server";

// Admin: mark a website lead as contacted, signed up or closed, and keep a short note.
export async function setWebsiteLeadStatus(formData: FormData) {
  await requireAdminSection("leads");
  const id = String(formData.get("id") ?? "").slice(0, 64);
  const status = String(formData.get("status") ?? "");
  const note = formData.has("note") ? String(formData.get("note") ?? "").trim() : undefined;
  if (!id) return;
  await updateWebsiteLead(id, { status: status || undefined, note });
  revalidatePath("/admin/leads");
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/** "Supplier", "wholesaler", "logistics", "rider"… → a lead role; null when the cell doesn't say. */
function roleFromText(text: string) {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  if (/suppl|wholesal|manufactur|distribut/.test(value)) return "supplier";
  if (/deliver|logist|rider|courier|dispatch/.test(value)) return "delivery";
  return "seller";
}

/** Admin: a lead from anywhere else (an event, a call, Instagram DMs), added by hand. */
export async function addLeadManually(formData: FormData) {
  await requireAdminSection("leads");
  const parsed = WebsiteLeadInput.safeParse({
    id: `admin-${randomUUID()}`,
    kind: "manual",
    name: field(formData, "name"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    message: field(formData, "message"),
    source: field(formData, "source") || "admin",
    consent: formData.get("consent") === "on",
    payload: { as: field(formData, "as") || "seller" },
  });
  if (!parsed.success) redirect(`/admin/leads?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the lead.")}`);
  const lead = await saveWebsiteLead(parsed.data);
  await matchLeadsToExistingUsers({ leadId: lead.id }).catch(() => 0);
  revalidatePath("/admin/leads");
  redirect("/admin/leads?added=1");
}

/**
 * Admin: a CSV of leads from elsewhere (event sign-ups, a partner list). Columns by header name: name, email,
 * phone, source, consent (yes/true/1). The same email or phone imported twice is one lead.
 */
export async function importLeadsCsv(formData: FormData) {
  await requireAdminSection("leads");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/admin/leads?error=Choose+a+CSV+file.");
  if (file.size > 2_000_000) redirect("/admin/leads?error=That+file+is+over+2+MB.");
  const source = field(formData, "source") || "import";
  const consentAll = formData.get("consent") === "on";
  const { data } = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z]/g, "") });
  let added = 0;
  let skipped = 0;
  for (const row of data.slice(0, 5000)) {
    const email = (row.email ?? row.emailaddress ?? "").trim();
    const phone = (row.phone ?? row.phonenumber ?? row.whatsapp ?? row.mobile ?? "").trim();
    const key = (email || phone).toLowerCase();
    const parsed = WebsiteLeadInput.safeParse({
      id: `import-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`,
      kind: "import",
      name: (row.name ?? row.fullname ?? [row.firstname, row.lastname].filter(Boolean).join(" ")).trim(),
      email,
      phone,
      source: (row.source ?? "").trim() || source,
      consent: consentAll || /^(y|yes|true|1)$/i.test((row.consent ?? "").trim()),
      // seller / supplier / delivery: the row's own "role" column, else the role picked for the whole file.
      payload: { as: roleFromText(row.role ?? row.as ?? "") ?? (field(formData, "as") || "seller") },
    });
    if (!key || !parsed.success) {
      skipped += 1;
      continue;
    }
    await saveWebsiteLead(parsed.data);
    added += 1;
  }
  // Anyone on the list who already has an account counts as signed up, so campaigns leave them out.
  await matchLeadsToExistingUsers({ days: 1 }).catch(() => 0);
  revalidatePath("/admin/leads");
  redirect(`/admin/leads?imported=${added}&skipped=${skipped}`);
}

/** Admin: answer a lead. A question from the website opens (or reopens) its inbox conversation; otherwise a new one. */
export async function replyToLead(formData: FormData) {
  await requireAdminSection("inbox");
  const id = field(formData, "id");
  const lead = id ? await db.websiteLead.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true } }) : null;
  if (!lead) redirect("/admin/leads?error=Lead+not+found.");
  const number = await conversationFromLead(lead.id);
  if (number) redirect(`/admin/support/${number}`);
  const params = new URLSearchParams({ channel: lead.email ? "email" : "whatsapp", name: lead.name ?? "", email: lead.email ?? "", phone: lead.phone ?? "" });
  redirect(`/admin/support/new?${params}`);
}
