import "server-only";
import { db } from "@/lib/db/client";
import { listRegistrations, registrationEnabled, registrationPrice, type RegistrationRole } from "./service.server";
import type { RegistrationForm } from "@shared/business-registration";

/** What the registration page needs: whether it's on, the price, the owner's applications, and details to prefill. */
export async function registrationPageData(user: { id: string; email?: string | null; name?: string | null; role: RegistrationRole }) {
  const [registrations, priceNgn, account, wallet] = await Promise.all([
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
  return { enabled: registrationEnabled(), priceNgn, registrations, prefill };
}
