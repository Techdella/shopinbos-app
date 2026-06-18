import { db } from "@/lib/db/client";
import { getDomainLookupCandidates } from "./storefront";

export async function getStoreByCustomDomain(rawDomain: string) {
  const candidates = getDomainLookupCandidates(rawDomain);

  return db.store.findFirst({
    where: {
      customDomain: { in: candidates },
      status: "active",
    },
    select: { slug: true },
  });
}
