import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogisticsOnboarding } from "@/components/onboarding/LogisticsOnboarding";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { rateCardsForPartner } from "@/lib/delivery-market/manage.server";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { walletBankNames } from "@/lib/wallet/wallet.server";
import type { RateRow } from "@shared/delivery-market";

export const dynamic = "force-dynamic";

// Delivery partner set-up. Everything the steps start from is read here, so a partner coming back sees what they
// already saved (business details, documents, areas, services, rate card, bank).
export default async function LogisticsOnboardingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) redirect("/logistics/profile");

  const [cards, wallet, banks] = await Promise.all([
    rateCardsForPartner(partner.id),
    db.wallet.findUnique({ where: { userId: user.id }, select: { bankName: true, accountName: true } }),
    walletBankNames().catch(() => [] as string[]),
  ]);
  const card = cards.publicCard;

  return (
    <Suspense>
      <LogisticsOnboarding
        partner={{
          companyName: partner.displayName || partner.companyName,
          cacNumber: partner.cacNumber ?? "",
          contactName: partner.contactName ?? user.name ?? "",
          contactPhone: partner.contactPhone ?? "",
          contactEmail: partner.contactEmail ?? user.email ?? "",
          address: partner.address ?? "",
          services: partner.services,
          pickupAreas: partner.pickupAreas,
          deliveryAreas: partner.deliveryAreas,
          vehicleTypes: partner.vehicleTypes,
          deliveryTypes: partner.deliveryTypes,
          documents: parseVerificationDocs(partner.verificationDocuments),
        }}
        rateCard={card ? { rows: card.rows as unknown as RateRow[], failedAttemptFee: card.failedAttemptFee, returnFee: card.returnFee, notes: card.notes ?? "" } : null}
        bank={wallet?.bankName && wallet.accountName ? { bankName: wallet.bankName, accountName: wallet.accountName } : null}
        banks={banks}
      />
    </Suspense>
  );
}
