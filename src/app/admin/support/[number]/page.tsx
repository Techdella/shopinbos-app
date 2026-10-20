import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame, formatDate, formatMoney } from "@/components/admin/AdminKit";
import { TicketWorkspace, type DeskMacro, type DeskMessage } from "@/components/support/admin/TicketWorkspace";
import { DeskPill, PriorityPill, SlaBadge, StatusPill, relativeTime } from "@/components/support/admin/ui";
import { PORTAL_LABEL, formatTicketNumber, parseTicketNumber, topicLabel, type SupportPortal } from "@/lib/support/pure";
import { STARTER_MACROS, getTicketForAgent, listMacros, supportReady, type AgentTicket } from "@/lib/support/service.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner", admin: "Admin" };

export default async function AdminSupportTicketPage(props: { params: Promise<{ number: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  if (!(await supportReady())) redirect("/admin/support");
  const number = parseTicketNumber((await props.params).number);
  if (!number) notFound();
  const [data, savedMacros] = await Promise.all([getTicketForAgent(number, user.id), listMacros()]);
  if (!data) notFound();

  const { ticket } = data;
  const now = Date.now();
  const macros: DeskMacro[] = savedMacros.length
    ? savedMacros.map((macro) => ({ id: macro.id, title: macro.title, body: macro.body, status: macro.status }))
    : STARTER_MACROS.map((macro) => ({ id: macro.id, title: macro.title, body: macro.body, status: macro.status, starter: true }));
  const messages: DeskMessage[] = data.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }));

  return (
    <AppPage
      frame={adminFrame(user, "Search support tickets")}
      title={ticket.subject}
      sub={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px]">{formatTicketNumber(ticket.number)}</span>
          <StatusPill status={ticket.status} />
          <PriorityPill priority={ticket.priority} />
          <SlaBadge ticket={ticket} now={now} />
          <span>
            {topicLabel(ticket.topic)} · {PORTAL_LABEL[ticket.portal as SupportPortal] ?? ticket.portal} · opened {relativeTime(ticket.createdAt, now)}
            {ticket.source === "email" ? " by email" : ticket.source === "web" ? " from the Stuck? form" : ticket.source === "whatsapp" ? " on WhatsApp" : " in the app"}
          </span>
        </span>
      }
      actions={<PillLink href="/admin/support" icon="arrowLeft">Inbox</PillLink>}
    >
      <TicketWorkspace
        ticket={{ id: ticket.id, number: ticket.number, name: ticket.name, email: ticket.email, phone: ticket.phone, subject: ticket.subject, topic: ticket.topic, status: ticket.status, priority: ticket.priority, assigneeId: ticket.assigneeId, source: ticket.source, lastUserMessageAt: ticket.lastUserMessageAt?.toISOString() ?? null }}
        messages={messages}
        transcript={data.transcript}
        macros={macros}
        admins={data.admins.map((admin) => ({ id: admin.id, name: admin.name }))}
        me={{ id: user.id, name: user.name }}
        now={now}
        side={<CustomerPanel data={data} now={now} />}
      />
    </AppPage>
  );
}

function CustomerPanel({ data, now }: { data: AgentTicket; now: number }) {
  const { ticket, context } = data;
  return (
    <>
      <section aria-label="Customer" className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
        <h2 className="m-0 mb-3 text-[15px] font-extrabold">Customer</h2>
        <div className="text-[15px] font-extrabold">{context?.user.name ?? ticket.name}</div>
        <dl className="m-0 mt-2 grid gap-1.5 text-[13.5px]">
          <Row label="Email">{ticket.email ?? context?.user.email ? <a href={`mailto:${ticket.email ?? context?.user.email}`} className="break-all text-app-ink">{ticket.email ?? context?.user.email}</a> : "-"}</Row>
          <Row label="Phone">{ticket.phone ?? context?.user.phone ?? "-"}</Row>
          {context && (
            <>
              <Row label="Role">{ROLE_LABEL[context.user.role] ?? context.user.role}</Row>
              <Row label="Plan">{context.plan.label}{context.plan.since ? ` since ${formatDate(context.plan.since)}` : ""}</Row>
              <Row label="Last login">{context.lastSignInAt ? relativeTime(context.lastSignInAt, now) : "Unknown"}</Row>
              <Row label="Joined">{formatDate(context.user.createdAt)}</Row>
              <Row label="Location">{[context.user.city, context.user.country].filter(Boolean).join(", ") || "-"}</Row>
            </>
          )}
          {ticket.path && <Row label="Was on">{ticket.path}</Row>}
        </dl>
        {data.matchedByContact && (
          <p className="m-0 mt-3 rounded-[12px] bg-[#FDF0D5] px-3 py-2 text-[12.5px] leading-[1.45] text-[#8A5A00]">
            Matched to this account by email or phone. They weren&apos;t signed in, so check it&apos;s really them before changing anything on the account.
          </p>
        )}
        {!context && <p className="m-0 mt-3 text-[13px] text-app-ink-soft">No Shopinbos account matches this email or phone.</p>}
      </section>

      {context?.business && (
        <section aria-label="Business" className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="m-0 text-[15px] font-extrabold">{context.business.kind}</h2>
            <DeskPill tone={context.business.status === "active" || context.business.status === "verified" ? "success" : "muted"}>{context.business.status}</DeskPill>
          </div>
          <Link href={context.business.href} className="text-[14.5px] font-bold text-app-ink no-underline hover:underline" target={context.business.href.startsWith("/s/") ? "_blank" : undefined}>
            {context.business.name}
          </Link>
          <div className="text-[13px] text-app-ink-soft">{context.business.detail}</div>
        </section>
      )}

      {context && (
        <section aria-label="Recent orders" className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
          <h2 className="m-0 mb-2 text-[15px] font-extrabold">Recent orders</h2>
          {context.orders.length ? (
            <ul className="m-0 grid list-none gap-2 p-0">
              {context.orders.map((order) => (
                <li key={order.id} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{order.label}</span>
                    <span className="block text-app-ink-soft">{order.kind} · {relativeTime(order.createdAt, now)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold">{formatMoney(order.amount, order.currency)}</span>
                    <span className="block text-app-ink-soft">{order.status.replace(/_/g, " ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-app-ink-soft">No orders yet.</p>
          )}
        </section>
      )}

      {(data.previous.length > 0 || ticket.rating) && (
        <section aria-label="History" className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
          {ticket.rating ? (
            <div className="mb-3">
              <h2 className="m-0 mb-1 text-[15px] font-extrabold">Their rating</h2>
              <div className="text-[14px] font-bold">{"★".repeat(ticket.rating)}<span className="text-app-line-strong">{"★".repeat(5 - ticket.rating)}</span> {ticket.rating}/5</div>
              {ticket.ratingComment && <p className="m-0 mt-1 text-[13px] text-app-ink-soft">&ldquo;{ticket.ratingComment}&rdquo;</p>}
            </div>
          ) : null}
          {data.previous.length > 0 && (
            <>
              <h2 className="m-0 mb-2 text-[15px] font-extrabold">Other tickets</h2>
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {data.previous.map((row) => (
                  <li key={row.number}>
                    <Link href={`/admin/support/${row.number}`} className="flex items-center gap-2 text-[13px] text-app-ink no-underline hover:underline">
                      <span className="font-mono text-[12px] text-app-ink-soft">{formatTicketNumber(row.number)}</span>
                      <span className="min-w-0 flex-1 truncate">{row.subject}</span>
                      <StatusPill status={row.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
      <dt className="text-app-ink-soft">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </div>
  );
}
