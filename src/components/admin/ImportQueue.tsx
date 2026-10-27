import { EmptyState, FilterChips, ListCard, ListRow, Pill, StatGrid, StatTile, Thumb } from "@/components/app-kit";
import { formatDate } from "@/components/admin/AdminKit";
import { Notice } from "@/components/app-ui";
import { IMPORT_PARTNER, IMPORT_SOURCE_LABEL, IMPORT_STATUS_LABEL, IMPORT_STATUS_TONE, PARTNER_FILTERS, isImportStatus, type ImportSource, type ImportStatus, type PartnerFilter } from "@/lib/imports/pure";

// Admin › China imports, the queue (the page loads it): counts, filters and one row per import.

export interface QueueRow {
  id: string;
  ref: string;
  source: string;
  title: string;
  photoUrl: string | null;
  qcPhotos: string[];
  quantity: number | null;
  shipping: string;
  destination: string | null;
  status: string;
  total: number | null;
  acceptedAt: Date | null;
  updatedAt: Date;
  store: { name: string } | null;
}

type Counts = Partial<Record<ImportStatus, number>>;

const naira = (value: number | null) => (value ? `₦${Math.round(value).toLocaleString("en-NG")}` : "No quote yet");
const countOf = (counts: Counts, statuses: readonly ImportStatus[]) => statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

export function ImportQueueFilters({ filter, counts }: { filter: PartnerFilter; counts: Counts }) {
  const all = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  return (
    <FilterChips
      items={[
        ...PARTNER_FILTERS.map((item) => ({ label: item.label, href: `/admin/imports?show=${item.key}`, count: countOf(counts, item.statuses), active: filter === item.key })),
        { label: "All", href: "/admin/imports?show=all", count: all, active: filter === "all" },
      ]}
    />
  );
}

export function ImportQueue({ rows, counts, filter, migrationNeeded, importsOpen }: { rows: QueueRow[]; counts: Counts; filter: PartnerFilter; migrationNeeded: boolean; importsOpen: boolean }) {
  const count = (statuses: readonly ImportStatus[]) => countOf(counts, statuses);
  return (
      <div className="grid gap-5">
        {migrationNeeded ? <Notice tone="info">China imports need a database update first. Run docs/migrations/2026-11-30-import-orders.sql, then reload.</Notice> : null}
        {!importsOpen ? <Notice tone="info">Sellers can&apos;t send requests yet. Set CHINA_IMPORTS_OPEN=true when {IMPORT_PARTNER.name} is ready to take orders.</Notice> : null}
        <StatGrid>
          <StatTile tone="card" label="To quote" value={count(["requested"])} hint="Quote within 24 hours" />
          <StatTile tone="card" label="Waiting on the seller" value={count(["quoted"])} hint="Quote sent, not paid" />
          <StatTile tone="card" label="On the way" value={count(["quote_paid", "bought", "checked", "shipping", "customs"])} hint="Paid, not delivered" />
          <StatTile tone="card" label="Delivered" value={count(["in_stock"])} />
        </StatGrid>
        {rows.length === 0 ? (
          <EmptyState icon="globe" title={filter === "new" ? "No new requests" : "Nothing here"}>
            {filter === "new" ? "New import requests from sellers show here. You'll get an alert for each one." : "Try another filter."}
          </EmptyState>
        ) : (
          <ListCard>
            {rows.map((row) => {
              const status: ImportStatus = isImportStatus(row.status) ? row.status : "requested";
              return (
                <ListRow key={row.id} href={`/admin/imports/${row.id}`}>
                  <Thumb src={row.qcPhotos[0] ?? row.photoUrl} label={row.title} size={52} />
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] font-bold text-app-ink-soft">{row.ref}</span>
                      <span className="text-[12px] text-app-ink-soft">{IMPORT_SOURCE_LABEL[row.source as ImportSource] ?? row.source}</span>
                    </div>
                    <div className="truncate text-[15px] font-extrabold">{row.title}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {row.store?.name ?? "A store"} · {row.quantity ? `${row.quantity.toLocaleString("en-NG")} units` : "Quantity to confirm"} · {row.shipping === "sea" ? "Sea" : "Air"}
                      {row.destination ? ` · to ${row.destination}` : ""}
                    </div>
                  </div>
                  <div className="flex min-w-[150px] flex-col items-start gap-1 sm:items-end">
                    <Pill tone={IMPORT_STATUS_TONE[status]} dot>{status === "quoted" && row.acceptedAt ? "Accepted, awaiting payment" : IMPORT_STATUS_LABEL[status]}</Pill>
                    <span className="text-[13px] font-bold">{naira(row.total)}</span>
                    <span className="text-[12px] text-app-ink-soft">Updated {formatDate(row.updatedAt)}</span>
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
        )}
      </div>
  );
}
