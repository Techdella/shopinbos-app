import type { Metadata } from "next";
import { AppPage, Pill } from "@/components/app-kit";
import { adminFrame, buttonClass } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { tipAudience, tipSettings, tipStats } from "@/lib/member-messaging/tips.server";
import { memberTemplateStatuses } from "@/lib/member-messaging/templates.server";
import { MEMBER_TEMPLATES, memberTemplatePreview } from "@/lib/member-messaging/whatsapp-templates";
import { TIPS, type TipRole } from "@/lib/member-messaging/tips-library";
import { FROM_NAME, TIP_HOUR, tipWeek, whatsappTipText } from "@/lib/member-messaging/tips-email";
import { journeyStats, journeysOn } from "@/lib/member-messaging/journeys.server";
import { loyaltyOn } from "@/lib/member-messaging/loyalty.server";
import { ANNIVERSARY_CREDITS, LOYALTY_TIERS } from "@shared/loyalty";
import { setJourneys, setLoyalty, setTipChannel, sendTestTip, submitTipTemplates } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member tips" };

// Admin › Leads › Member tips: the weekly tips from Rex & Peggy to sellers, suppliers and delivery partners. Switch
// each channel on, check the numbers, preview every tip and email one to yourself. Sending is tips.server.ts.

const ROLE_LABEL: Record<TipRole, string> = { seller: "Sellers", supplier: "Suppliers", logistics_partner: "Delivery partners" };
const ROLES: TipRole[] = ["seller", "supplier", "logistics_partner"];

export default async function AdminMemberTipsPage(props: { searchParams?: Promise<{ saved?: string; error?: string; role?: string }> }) {
  const user = await requireAdminSection("leads");
  const params = (await props.searchParams) ?? {};
  const role = (ROLES as string[]).includes(params.role ?? "") ? (params.role as TipRole) : "seller";
  const [settings, audience, stats, templates, journeys, journeyCounts, loyalty] = await Promise.all([tipSettings(), tipAudience(), tipStats(), memberTemplateStatuses().catch(() => null), journeysOn(), journeyStats(), loyaltyOn()]);
  const tipTemplates = MEMBER_TEMPLATES.filter((template) => template.group === "tips" || template.group === "journeys");
  const thisWeek = tipWeek(new Date());

  const channels = [
    { key: "whatsapp" as const, title: "WhatsApp tip", when: `Wednesdays from ${TIP_HOUR}:00`, reach: audience.whatsapp, note: "Needs the three tip templates approved by Meta and the number's display name approved. People can reply STOP." },
    { key: "email" as const, title: "Tips email", when: `Thursdays from ${TIP_HOUR}:00`, reach: audience.email, note: "Sellers also get “Top products to sell this week”; suppliers get what shops are adding. Unsubscribe link included." },
  ];

  return (
    <AppPage frame={adminFrame(user, "Search")} title="Member tips & journeys" sub="A weekly tip from Rex & Peggy for sellers, suppliers and delivery partners, and the messages that help them finish setting up, celebrate first wins and come back when they go quiet.">
      {(params.saved || params.error) && (
        <p role="status" className={`mb-4 rounded-[14px] px-4 py-3 text-[14.5px] font-bold ${params.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>{params.error ?? params.saved}</p>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-2" aria-label="Channels">
        {channels.map((channel) => {
          const on = settings[channel.key];
          return (
            <div key={channel.key} className="rounded-[20px] border border-app-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[18px] font-extrabold">{channel.title}</h2>
                  <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{channel.when} (Lagos) · about {channel.reach.toLocaleString("en-NG")} people</p>
                </div>
                <Pill tone={on ? "success" : "muted"} dot>{on ? "On" : "Off"}</Pill>
              </div>
              <p className="mb-4 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">{channel.note}</p>
              <form action={setTipChannel}>
                <input type="hidden" name="channel" value={channel.key} />
                <input type="hidden" name="on" value={on ? "0" : "1"} />
                <button type="submit" className={buttonClass(on ? "white" : "ink", "sm")}>{on ? "Switch off" : "Switch on"}</button>
              </form>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="journeys" className="mb-6 rounded-[20px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="journeys" className="m-0 text-[18px] font-extrabold">Journeys</h2>
            <p className="m-0 mt-1 max-w-[760px] text-[13.5px] leading-[1.5] text-app-ink-soft">
              Hourly, by email and the bell (WhatsApp where a template is approved): <strong>setup help</strong> for suppliers and delivery partners on day 3 and 10;
              <strong> win-back</strong> after 7, 14 (with 50 free AI credits, once in 180 days) and 30 quiet days; <strong>first win</strong> congratulations;
              and <strong>low AI credits</strong> once a month. Marketing ones only Mon–Sat 08:00–20:00, at most 3 marketing emails a week per person.
            </p>
          </div>
          <span className="flex items-center gap-3">
            <Pill tone={journeys ? "success" : "muted"} dot>{journeys ? "On" : "Off"}</Pill>
            <form action={setJourneys}>
              <input type="hidden" name="on" value={journeys ? "0" : "1"} />
              <button type="submit" className={buttonClass(journeys ? "white" : "ink", "sm")}>{journeys ? "Switch off" : "Switch on"}</button>
            </form>
          </span>
        </div>
        <ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-5">
          {journeyCounts.map((row) => (
            <li key={row.kind} className="rounded-[14px] bg-app-canvas px-3 py-2.5 text-[13px]">
              <span className="block font-bold">{({ setup_help: "Setup help", winback: "Win-back", first_win: "First wins", credits_low: "Low credits", announce_referral: "Refer & earn news" } as Record<string, string>)[row.kind]}</span>
              <span className="text-app-ink-soft">{row.sent} sent · {row.failed} failed · {row.skipped} skipped (30 days)</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="loyalty" className="mb-6 rounded-[20px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="loyalty" className="m-0 text-[18px] font-extrabold">Loyalty perks</h2>
            <p className="m-0 mt-1 max-w-[760px] text-[13.5px] leading-[1.5] text-app-ink-soft">
              Tiers from the rewards levels: {LOYALTY_TIERS.map((tier) => `${tier.name} (level ${tier.levels.join("–")}${tier.monthlyCredits ? `, ${tier.monthlyCredits} credits a month` : ""})`).join(" · ")}. When on, the monthly credits are added, people hear when they move up a tier, and each account anniversary brings {ANNIVERSARY_CREDITS} credits. Everyone who joined before 1 December 2026 shows as a founding member.
            </p>
          </div>
          <span className="flex items-center gap-3">
            <Pill tone={loyalty ? "success" : "muted"} dot>{loyalty ? "On" : "Off"}</Pill>
            <form action={setLoyalty}>
              <input type="hidden" name="on" value={loyalty ? "0" : "1"} />
              <button type="submit" className={buttonClass(loyalty ? "white" : "ink", "sm")}>{loyalty ? "Switch off" : "Switch on"}</button>
            </form>
          </span>
        </div>
      </section>

      <section aria-labelledby="tip-stats" className="mb-6 rounded-[20px] border border-app-line bg-white p-5">
        <h2 id="tip-stats" className="m-0 text-[18px] font-extrabold">Last 4 weeks</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="text-app-ink-soft">
                <th className="py-2 font-semibold">Week of</th>
                <th className="py-2 font-semibold">WhatsApp sent · tapped</th>
                <th className="py-2 font-semibold">Email sent · tapped</th>
                <th className="py-2 font-semibold">Failed</th>
                <th className="py-2 font-semibold">Skipped (opted out)</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((week) => (
                <tr key={week.period} className="border-t border-app-line">
                  <td className="py-2 font-bold">{week.period}{week.period === thisWeek ? " (this week)" : ""}</td>
                  <td className="py-2">{week.whatsapp.sent} · {week.whatsapp.taps}</td>
                  <td className="py-2">{week.email.sent} · {week.email.taps}</td>
                  <td className="py-2">{week.whatsapp.failed + week.email.failed}</td>
                  <td className="py-2">{week.whatsapp.skipped + week.email.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="tip-templates" className="mb-6 rounded-[20px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="tip-templates" className="m-0 text-[18px] font-extrabold">WhatsApp templates</h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">The weekly tips (one per role: the tip is filled in each week) and the setup-help and welcome-back journeys. They only need approving once.</p>
          </div>
          <form action={submitTipTemplates}><button type="submit" className={buttonClass("ink", "sm")}>Submit the missing ones</button></form>
        </div>
        {templates && !templates.ok && <p className="mb-0 mt-3 text-[13px] text-app-danger">{templates.error}</p>}
        <ul className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-3">
          {tipTemplates.map((template) => {
            const state = (templates?.ok ? templates.byName.get(`${template.name}:${template.language}`)?.status : undefined) ?? "NOT SUBMITTED";
            return (
              <li key={template.name} className="rounded-[16px] border border-app-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-bold">{template.name}</span>
                  <Pill tone={state === "APPROVED" ? "success" : state === "REJECTED" ? "danger" : state === "NOT SUBMITTED" ? "muted" : "warning"}>{state.toLowerCase()}</Pill>
                </div>
                <img src={`/brand/members/${template.image}.jpg`} alt="" className="mt-3 w-full rounded-[10px] border border-app-line" />
                <p className="mb-0 mt-3 whitespace-pre-wrap text-[13px] leading-[1.5]">{memberTemplatePreview(template)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="tip-library">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="tip-library" className="m-0 text-[18px] font-extrabold">The tips, in the order people get them</h2>
          <nav className="flex flex-wrap gap-2" aria-label="Role">
            {ROLES.map((value) => (
              <a key={value} href={`/admin/member-tips?role=${value}`} className={`rounded-full px-4 py-2 text-[13.5px] font-bold no-underline ${value === role ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink"}`}>
                {ROLE_LABEL[value]} ({TIPS.filter((tip) => tip.role === value).length})
              </a>
            ))}
          </nav>
        </div>
        <ol className="m-0 grid list-none gap-3 p-0">
          {TIPS.filter((tip) => tip.role === role).map((tip, index) => (
            <li key={tip.id} className="rounded-[18px] border border-app-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-mono text-[11px] uppercase tracking-[0.14em] text-app-ink-soft">Week {index + 1} · from {FROM_NAME[tip.from]} · {tip.topic}</p>
                  <h3 className="m-0 mt-1 text-[16px] font-extrabold">{tip.subject}</h3>
                  <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{tip.preheader}</p>
                </div>
                <form action={sendTestTip}>
                  <input type="hidden" name="tip" value={tip.id} />
                  <button type="submit" className={buttonClass("white", "sm")}>Email me a test</button>
                </form>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-bold">Preview</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[14px] bg-app-canvas p-4 text-[13.5px] leading-[1.55]">
                    <p className="m-0 font-extrabold">{tip.title}</p>
                    <p className="m-0 mt-2">{tip.intro}</p>
                    <ol className="mb-0 mt-2 pl-5">{tip.points.map((point) => <li key={point} className="mb-1">{point}</li>)}</ol>
                    {tip.example && <p className="mb-0 mt-2 text-app-ink-soft">Example: {tip.example}</p>}
                    <p className="mb-0 mt-2 font-bold">Button: {tip.cta.label} → {tip.cta.path}</p>
                  </div>
                  <div className="rounded-[14px] bg-[#E7FCE3] p-4 text-[13.5px] leading-[1.55]">
                    <p className="m-0 font-mono text-[11px] uppercase tracking-[0.14em] text-app-ink-soft">WhatsApp</p>
                    <p className="m-0 mt-2">Hi Ada, here&apos;s this week&apos;s tip from {FROM_NAME[tip.from]} 💡</p>
                    <p className="m-0 mt-2">{whatsappTipText(tip)}</p>
                    <p className="m-0 mt-2 text-app-ink-soft">Tap below to try it in Shopinbos. Reply STOP if you&apos;d rather not get weekly tips.</p>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </AppPage>
  );
}
