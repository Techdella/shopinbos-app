import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, FilterChips, ListCard, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { formatDate, humanize } from "@/components/growth/kit";
import { ensureStorefrontVisitorTables } from "@/lib/storefront/visitor-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Form submissions" };

const FILTERS = [
  { key: "", label: "All" },
  { key: "contact", label: "Contact" },
  { key: "newsletter", label: "Newsletter" },
];

export default async function SellerFormSubmissionsPage({ searchParams }: { searchParams?: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  await ensureStorefrontVisitorTables();
  const submissions = await db.$queryRawUnsafe<Array<{
    id: string;
    type: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    status: string;
    createdAt: Date;
  }>>(
    `SELECT id, type, name, email, phone, message, status, "createdAt" FROM "StoreFormSubmission" WHERE "storeId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
    store.id,
  );

  const contactCount = submissions.filter((item) => item.type === "contact").length;
  const newsletterCount = submissions.filter((item) => item.type === "newsletter").length;
  const newCount = submissions.filter((item) => item.status === "new").length;
  const active = FILTERS.find((filter) => filter.key === params?.type) ?? FILTERS[0];
  const shown = active.key ? submissions.filter((item) => item.type === active.key) : submissions;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Form submissions"
      sub="Messages, sign-ups and leads from the forms on your store."
      actions={
        <>
          <PillLink href="/home/marketing/forms" icon="settings">Manage forms</PillLink>
          <PillLink href={`/s/${store.slug}`} icon="globe">View store</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Total" value={submissions.length} hint="Latest 100" />
          <StatTile tone="card" label="New" value={newCount} />
          <StatTile tone="card" label="Contact" value={contactCount} />
          <StatTile tone="card" label="Newsletter" value={newsletterCount} />
        </StatGrid>

        <FilterChips
          items={FILTERS.map((filter) => ({
            label: filter.label,
            href: filter.key ? `/home/forms?type=${filter.key}` : "/home/forms",
            count: filter.key === "contact" ? contactCount : filter.key === "newsletter" ? newsletterCount : submissions.length,
            active: filter === active,
          }))}
        />

        {shown.length === 0 ? (
          <EmptyState icon="message" title="No submissions yet">When shoppers use your contact or newsletter form, what they send shows up here.</EmptyState>
        ) : (
          <ListCard>
            {shown.map((submission) => (
              <li key={submission.id} className="flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas">
                  <Icon name={submission.type === "newsletter" ? "mail" : "message"} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="min-w-0 truncate text-[15px] font-extrabold">{submission.name || submission.email || "Visitor"}</strong>
                    <Pill tone={submission.type === "newsletter" ? "info" : "accent"}>{humanize(submission.type)}</Pill>
                    {submission.status === "new" && <Pill tone="success" dot>New</Pill>}
                    <span className="text-[12.5px] text-app-ink-soft">{formatDate(submission.createdAt, true)}</span>
                  </div>
                  {(submission.email || submission.phone) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13.5px]">
                      {submission.email && <a href={`mailto:${submission.email}`} className="break-all text-app-ink-soft no-underline hover:text-app-ink hover:underline">{submission.email}</a>}
                      {submission.phone && <a href={`tel:${submission.phone}`} className="text-app-ink-soft no-underline hover:text-app-ink hover:underline">{submission.phone}</a>}
                    </div>
                  )}
                  {submission.message ? <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-[14px] leading-[1.55]">{submission.message}</p> : null}
                </div>
              </li>
            ))}
          </ListCard>
        )}
      </div>
    </SellerPage>
  );
}
