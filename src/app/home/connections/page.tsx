import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, Pill, TextLink } from "@/components/app-kit";
import { buttonClass } from "@/components/growth/kit";
import { Icon } from "@/components/ui/Icon";
import { PlatformLogo } from "@/components/channels/PlatformLogo";
import { googleOverview } from "@/lib/google/connect.server";
import { channelCards } from "@/lib/sales-channels/server";
import { COMING_SOON_PLATFORMS, PLATFORM_NAME, isOAuthPlatform, platformConfigured } from "@/lib/sales-channels/pure";
import { emailRow, googleConfigured as gmailConfigured, readEmailSettings } from "@/lib/email-channel/server";
import { disconnectGoogleAction, finishGoogleSetupAction } from "@/app/actions/connections";
import { ConnectAccounts } from "@/app/channels/ConnectAccounts";
import { SoonCard } from "@/app/channels/ChannelClient";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

// Connections: every account the store connects, on one page, each with what it does in plain words and one
// button. WhatsApp, Facebook & Instagram (src/app/channels/ConnectAccounts.tsx); Google, one sign-in for free
// listings, reviews and search (src/lib/google/connect.server.ts), plus Gmail; and what's coming soon. Nothing to
// paste, and stores load no tracking tags, so there's no cookie notice to set up.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("traffic");
  return { title: t("conn.title") };
}

type ConnT = TFunction<MessageKey<"traffic"> | MessageKey<"social"> | MessageKey<"common">>;
type Search = Promise<{ saved?: string; connected?: string; problem?: string; finished?: string }>;

const NEXT = encodeURIComponent("/home/connections");

/** One Google feature: what it does, and where it stands. */
function GoogleRow({ title, what, status, on }: { title: string; what: string; status: ReactNode; on: boolean }) {
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1.5 py-3.5">
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft"}`} aria-hidden>
        <Icon name={on ? "check" : "plus"} size={13} />
      </span>
      <span className="min-w-0 flex-1 basis-[220px]">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[13.5px] leading-[1.5] text-app-ink-soft">{what}</span>
      </span>
      <span className="min-w-0 basis-full pl-10 text-[13.5px] sm:basis-auto sm:pl-0 sm:text-right">{status}</span>
    </li>
  );
}

const external = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline underline-offset-2">{label}</a>
);

export default async function ConnectionsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireRole(["seller"], "/login");
  const t: ConnT = await getT("traffic", "social", "common");
  const params = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true, customDomain: true } });
  if (!store) redirect("/onboarding?role=seller");

  const [{ cards, interest }, google, email] = await Promise.all([channelCards(store.id), googleOverview(store.id), emailRow(store.id).catch(() => null)]);
  const shopping = cards.find((card) => card.platform === "google")?.state ?? { kind: "soon" as const };
  const googleReady = platformConfigured("google");
  const googleLinked = shopping.kind !== "connect" && shopping.kind !== "soon";
  const emailSettings = readEmailSettings(email?.settings);
  const gmail = email?.status === "connected" && emailSettings.provider === "gmail" ? (emailSettings.gmail?.email ?? null) : null;
  const unfinished = googleLinked && (google.reviews.state !== "on" || google.search.state !== "on");

  const done = isOAuthPlatform(params.connected) && !params.problem ? PLATFORM_NAME[params.connected] : null;
  const failed = isOAuthPlatform(params.problem) ? PLATFORM_NAME[params.problem] : null;

  const off = <span className="text-app-ink-soft">{t("cx.off")}</span>;
  const on = (text?: string | null) => <span className="font-semibold text-app-success">{text ? `✓ ${text}` : `✓ ${t("cx.on")}`}</span>;

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("conn.title")} sub={t("conn.sub")}>
      <div className="grid gap-6">
        {done && <p role="status" className="m-0 rounded-[14px] bg-app-mint px-4 py-3 text-[14px] font-semibold">{t("connectedOk", { name: done })}</p>}
        {failed && <p role="status" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{t("problem", { name: failed })}</p>}
        {params.finished && <p role="status" className="m-0 rounded-[14px] bg-app-mint px-4 py-3 text-[14px] font-semibold">{t("cx.finished")}</p>}
        {params.saved && <p role="status" className="m-0 rounded-[14px] bg-app-success-tint px-4 py-3 text-[14px] text-app-success">{t("conn.saved")}</p>}

        <section aria-labelledby="social-title" className="grid gap-3">
          <div>
            <h2 id="social-title" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("cx.social.title")}</h2>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{t("cx.social.sub")}</p>
          </div>
          <ConnectAccounts storeId={store.id} only={["whatsapp", "meta"]} next="/home/connections" columns="md:grid-cols-2" />
        </section>

        <section aria-labelledby="google-title" id="google" className="scroll-mt-24">
          <Card className="grid min-w-0 gap-2 p-5">
            <div className="flex flex-wrap items-start gap-3">
              <PlatformLogo platform="google" />
              <div className="min-w-0 flex-1">
                <h2 id="google-title" className="m-0 text-[18px] font-extrabold">{t("cx.google.title")}</h2>
                <p className="mb-0 mt-1 text-[14px] leading-[1.5] text-app-ink-soft">{t("cx.google.sub")}</p>
              </div>
              {googleLinked && <Pill tone={shopping.kind === "reauth" || shopping.kind === "error" ? "warning" : "success"} dot>{shopping.kind === "reauth" ? t("card.connectAgain") : t("cx.on")}</Pill>}
            </div>

            <ul className="m-0 list-none divide-y divide-app-line p-0">
              <GoogleRow
                title={t("cx.g.shopping.title")}
                what={t("cx.g.shopping.what")}
                on={shopping.kind === "connected" || shopping.kind === "syncing"}
                status={
                  shopping.kind === "connected" ? on(shopping.count !== null ? t("card.showing", { count: shopping.count }) : null)
                  : shopping.kind === "syncing" ? <span className="text-app-ink-soft">{t("card.syncing")}</span>
                  : shopping.kind === "needs_account" ? <>{t("cx.g.shopping.needs")} {external("https://merchants.google.com/", t("cx.createFree"))}</>
                  : shopping.kind === "error" ? <span className="text-app-danger">{t("card.failed", { name: "Google" })}</span>
                  : off
                }
              />
              <GoogleRow
                title={t("cx.g.reviews.title")}
                what={t("cx.g.reviews.what")}
                on={google.reviews.state === "on"}
                status={google.reviews.state === "on" ? on(google.reviews.name) : google.reviews.state === "choose" ? <TextLink href="/home/reviews/sources">{t("cx.g.reviews.choose")}</TextLink> : off}
              />
              <GoogleRow
                title={t("cx.g.search.title")}
                what={t("cx.g.search.what")}
                on={google.search.state === "on"}
                status={google.search.state === "on" ? <>{on()} · <TextLink href="/home/analytics/traffic">{t("cx.see")}</TextLink></> : google.search.state === "waiting" ? <span className="text-app-ink-soft">{t("cx.g.search.waiting")}</span> : off}
              />
              <GoogleRow
                title={t("cx.g.gmail.title")}
                what={t("cx.g.gmail.what")}
                on={Boolean(gmail)}
                status={gmail ? on(gmail) : gmailConfigured() ? <a href="/api/app/inbox/email/gmail/connect" className={buttonClass("white", "sm")}>{t("cx.g.gmail.connect")}</a> : <span className="text-app-ink-soft">{t("card.soon")}</span>}
              />
            </ul>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!googleReady && !googleLinked ? (
                <button type="button" disabled className={buttonClass("white", "md")}>{t("card.soon")}</button>
              ) : !googleLinked || shopping.kind === "reauth" ? (
                <a href={`/api/app/sales-channels/google/connect?next=${NEXT}`} className={buttonClass("ink", "md")}>{shopping.kind === "reauth" ? t("card.connectAgain") : t("cx.google.connect")}</a>
              ) : (
                <>
                  {unfinished && (
                    <form action={finishGoogleSetupAction}><button type="submit" className={buttonClass("ink", "sm")}>{t("cx.google.finish")}</button></form>
                  )}
                  <form action={disconnectGoogleAction}><button type="submit" className={buttonClass("white", "sm")}>{t("card.disconnect")}</button></form>
                </>
              )}
            </div>
            {unfinished && <p className="m-0 text-[13px] text-app-ink-soft">{t("cx.google.finishHint")}</p>}
          </Card>
        </section>

        <section aria-labelledby="soon-title" className="grid gap-3">
          <h2 id="soon-title" className="m-0 text-[18px] font-extrabold tracking-[-0.2px]">{t("soon.title")}</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-5">
            {COMING_SOON_PLATFORMS.map((platform) => (
              <SoonCard key={platform} platform={platform} name={PLATFORM_NAME[platform]} noted={interest.includes(platform)} />
            ))}
          </ul>
        </section>

      </div>
    </SellerPage>
  );
}
