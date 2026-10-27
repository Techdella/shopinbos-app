import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { ImportQueue, ImportQueueFilters } from "@/components/admin/ImportQueue";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { IMPORT_PARTNER, partnerFilter, statusesFor } from "@/lib/imports/pure";
import { chinaImportsOpen, listPartnerImports, partnerImportCounts } from "@/lib/imports/service.server";
import { isMissingTable } from "@/lib/rate-limit-core";

export const dynamic = "force-dynamic";

// /admin/imports: the sourcing partner's queue (ShopKonfam staff sign in with the "Sourcing partner" role and see
// only this). New requests to quote, quotes waiting on the seller, orders on their way, and what's delivered (src/components/admin/ImportQueue.tsx).

export default async function AdminImportsPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const user = await requireAdminSection("imports");
  const filter = partnerFilter((await searchParams)?.show);
  let migrationNeeded = false;
  let rows: Awaited<ReturnType<typeof listPartnerImports>> = [];
  let counts: Awaited<ReturnType<typeof partnerImportCounts>> = {};
  try {
    [rows, counts] = await Promise.all([listPartnerImports(statusesFor(filter)), partnerImportCounts()]);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    migrationNeeded = true;
  }

  return (
    <AppPage
      frame={adminFrame(user, "Search imports")}
      title="China imports"
      sub={`Sellers' requests from ShopKonfam and 1688 links, photos and descriptions. ${IMPORT_PARTNER.name} quotes each one in naira, then moves it along until it's delivered. Sellers see every step in My imports.`}
      toolbar={<ImportQueueFilters filter={filter} counts={counts} />}
    >
      <ImportQueue rows={rows} counts={counts} filter={filter} migrationNeeded={migrationNeeded} importsOpen={chinaImportsOpen()} />
    </AppPage>
  );
}
