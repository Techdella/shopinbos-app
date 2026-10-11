import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, ListCard, ListRow, Pill, PillLink, SplitLayout, TextLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { formatDate, humanize } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automations" };

const PAID = ["paid", "processing", "packed", "shipped", "delivered"];

export default async function SellerAutomationsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const [recentOrders, rules] = store
    ? await Promise.all([
        db.retailOrder.findMany({
          where: { storeId: store.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, status: true, total: true, createdAt: true },
        }),
        db.$queryRawUnsafe<Array<{ id: string; name: string; trigger: string; actionType: string; active: boolean }>>(
          `SELECT id, name, trigger, "actionType", active FROM "AutomationRule" WHERE "storeId" = $1 ORDER BY "updatedAt" DESC LIMIT 20`,
          store.id,
        ),
      ])
    : [[], []];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Automations"
      sub="Emails and updates that go out on their own when something happens in your shop."
      actions={<PillLink href="/home/marketing?tab=Automations&action=new" tone="accent" icon="plus">New automation</PillLink>}
    >
      <SplitLayout
        main={
          <>
            <Card className="p-5">
              <div className="flex flex-wrap items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-mint"><Icon name="mail" size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-[17px] font-extrabold">Order confirmation</h2>
                    <Pill tone="success" dot>On</Pill>
                  </div>
                  <p className="mb-0 mt-1.5 text-[14px] leading-[1.55] text-app-ink-soft">
                    When a customer checks out, Shopinbos makes the order, emails the buyer a receipt, emails you, and adds a notification in the app. This is always on.
                  </p>
                </div>
              </div>
            </Card>

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-[17px] font-extrabold">Recent runs</h2>
                <TextLink href="/home/orders">All orders</TextLink>
              </div>
              {recentOrders.length ? (
                <ListCard>
                  {recentOrders.map((order) => (
                    <ListRow key={order.id} href={`/home/orders/${order.id}`}>
                      <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <span className="block truncate text-[14.5px] font-extrabold">{order.buyerName || order.buyerEmail || "Customer"}</span>
                        <span className="block truncate text-[13px] text-app-ink-soft">{order.orderNumber}{order.buyerEmail ? ` · receipt to ${order.buyerEmail}` : " · no email for a receipt"}</span>
                      </span>
                      <span className="text-[13px] text-app-ink-soft sm:w-[140px]">{formatDate(order.createdAt, true)}</span>
                      <Pill tone={PAID.includes(order.status) ? "success" : "muted"}>{humanize(order.status)}</Pill>
                      <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{naira(order.total)}</span>
                    </ListRow>
                  ))}
                </ListCard>
              ) : (
                <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">No runs yet. New checkout orders show up here.</Card>
              )}
            </section>
          </>
        }
        side={
          <Card className="overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <CardHead title="Your automations" action={<TextLink href="/home/marketing?tab=Automations">Manage</TextLink>} />
            </div>
            {rules.length ? (
              <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <a href={`/home/marketing?tab=Automations&action=edit&id=${rule.id}`} className="flex min-h-[56px] items-center gap-3 px-5 py-2.5 text-app-ink no-underline hover:bg-app-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-extrabold">{rule.name}</span>
                        <span className="block truncate text-[12.5px] text-app-ink-soft">{humanize(rule.trigger)}: {humanize(rule.actionType).toLowerCase()}</span>
                      </span>
                      <Pill tone={rule.active ? "success" : "muted"}>{rule.active ? "On" : "Off"}</Pill>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 border-t border-app-line px-5 py-6 text-[14px] leading-[1.5] text-app-ink-soft">
                None yet. Add one for shipping updates, payment receipts or abandoned cart reminders.
              </p>
            )}
          </Card>
        }
      />
    </SellerPage>
  );
}
