import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { ensureStorefrontVisitorTables } from "@/lib/storefront/visitor-data";

export const dynamic = "force-dynamic";

function fmtDate(value: Date | string) {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SellerFormSubmissionsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/builder?firstRun=1");

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
    workspace.store.id,
  );

  const contactCount = submissions.filter((item) => item.type === "contact").length;
  const newsletterCount = submissions.filter((item) => item.type === "newsletter").length;

  return (
    <AppFrame
      role="seller"
      storeName={workspace.store.name}
      storeSlug={workspace.store.slug}
      storeInitial={workspace.store.name?.[0]?.toUpperCase()}
      storeLogoUrl={workspace.store.logoUrl}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <main className="page-shell">
        <PageHead
          title="Form submissions"
          sub="Contact, newsletter, and storefront lead submissions collected in-app."
          actions={<a className="dbtn dBtn-mint" href={`/s/${workspace.store.slug}`}><Icon name="globe" size={14} /> View store</a>}
        />

        <section className="grid gap-3 md:grid-cols-3 mb-5">
          <div className="card p-4"><div className="text-sm text-muted">Total</div><div className="text-2xl font-bold">{submissions.length}</div></div>
          <div className="card p-4"><div className="text-sm text-muted">Contact</div><div className="text-2xl font-bold">{contactCount}</div></div>
          <div className="card p-4"><div className="text-sm text-muted">Newsletter</div><div className="text-2xl font-bold">{newsletterCount}</div></div>
        </section>

        <section className="card overflow-hidden">
          <div className="p-4 border-b border-line">
            <h2 className="text-base font-semibold m-0">Recent submissions</h2>
          </div>
          {submissions.length === 0 ? (
            <div className="p-8 text-center text-muted">No form submissions yet.</div>
          ) : (
            <div className="divide-y border-line">
              {submissions.map((submission) => (
                <article key={submission.id} className="p-4 flex gap-4 items-start">
                  <div className="h-10 w-10 rounded-full grid place-items-center shrink-0 lead-icon-teal">
                    <Icon name={submission.type === "newsletter" ? "mail" : "message"} size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <strong>{submission.name || submission.email || "Visitor"}</strong>
                      <Badge color={submission.type === "newsletter" ? "var(--purple)" : "var(--teal-600)"}>{submission.type}</Badge>
                      <span className="text-xs text-muted">{fmtDate(submission.createdAt)}</span>
                    </div>
                    <div className="text-sm text-muted">{[submission.email, submission.phone].filter(Boolean).join(" · ")}</div>
                    {submission.message ? <p className="mt-2 text-sm leading-6">{submission.message}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppFrame>
  );
}
