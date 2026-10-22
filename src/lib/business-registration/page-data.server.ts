import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { portalDashboardPath } from "@/lib/portal-routes";
import { listRegistrations, registrationEnabled, registrationPrice, type RegistrationRole } from "./service.server";
import type { RegistrationForm } from "@shared/business-registration";

/** What the registration page needs: whether it's on, the price, the owner's applications, and details to prefill. */
export async function registrationPageData(user: { id: string; email?: string | null; name?: string | null; role: RegistrationRole }) {
  const [enabled, registrations, priceNgn, account, wallet] = await Promise.all([
    registrationEnabled(),
    listRegistrations(user.id),
    registrationPrice(),
    db.user.findUnique({ where: { id: user.id }, select: { phone: true, email: true, name: true } }),
    db.wallet.findUnique({ where: { userId: user.id }, select: { kycStatus: true, kycFirstName: true, kycLastName: true } }),
  ]);
  // The verified ID's name first (CAC compares it with the ID picture), else the account name.
  const [first = "", ...rest] = (account?.name ?? user.name ?? "").trim().split(/\s+/);
  const verified = wallet?.kycStatus === "verified";
  const prefill: Partial<RegistrationForm> = {
    proprietorFirstname: (verified && wallet?.kycFirstName) || first,
    proprietorSurname: (verified && wallet?.kycLastName) || rest.join(" "),
    proprietorEmail: account?.email ?? user.email ?? "",
    companyEmail: account?.email ?? user.email ?? "",
    proprietorPhonenumber: account?.phone ?? "",
  };
  return { enabled, priceNgn, registrations, prefill };
}

/**
 * While registration is switched off (Admin › Settings › Launches), the page only exists for people with an
 * application to follow; everyone else goes back to their dashboard.
 */
export function hideRegistrationPageWhenOff(data: { enabled: boolean; registrations: unknown[] }, role: RegistrationRole) {
  if (!data.enabled && data.registrations.length === 0) redirect(portalDashboardPath(role));
}
