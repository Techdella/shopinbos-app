import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { verifyEmailToken, type EmailLinkTarget } from "@/lib/email/tokens";
import { PLATFORM_REQUIRED, PLATFORM_TOPICS, STORE_TOPICS, type PlatformTopic, type StoreTopic } from "@/lib/email/preferences";
import { contactPreferences, platformEmailPrefs, saveContactPreferences, savePlatformEmailPrefs } from "@/lib/email/preferences.server";
import { notificationSettingsUrl, platformLegal, SENDER_STORE_SELECT, storeSender } from "@/lib/email/compliance.server";

// The email preference center, reached from the footer of every marketing and lifecycle email. Public: the signed
// token in the URL is the credential (src/lib/email/tokens.ts), so nobody needs to sign in.
//   store contacts (B): topics from that shop, SMS/WhatsApp marketing, unsubscribe from all
//   Shopinbos users (A): product news, onboarding nudges, weekly summaries (security and billing always send)
// Changes are server actions, so a link scanner opening the page never changes anything.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ unsubscribe?: string; saved?: string; done?: string }>;
};

function target(token: string): EmailLinkTarget {
  const found = verifyEmailToken(decodeURIComponent(token));
  if (!found) notFound();
  return found;
}

async function save(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const found = verifyEmailToken(token);
  if (!found) notFound();
  const on = (name: string) => formData.get(name) === "on";
  if (found.kind === "contact") {
    const topics = Object.fromEntries(STORE_TOPICS.map((t) => [t.key, on(`topic_${t.key}`)])) as Record<StoreTopic, boolean>;
    await saveContactPreferences(found.storeId, found.email, {
      topics,
      ...(formData.get("has_sms") ? { sms: on("sms") } : {}),
      ...(formData.get("has_whatsapp") ? { whatsapp: on("whatsapp") } : {}),
    });
  } else {
    await savePlatformEmailPrefs(found.userId, Object.fromEntries(PLATFORM_TOPICS.map((t) => [t.key, on(`topic_${t.key}`)])) as Record<PlatformTopic, boolean>);
  }
  redirect(`/email/preferences/${encodeURIComponent(token)}?saved=1`);
}

async function unsubscribeAll(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const found = verifyEmailToken(token);
  if (!found) notFound();
  if (found.kind === "contact") await saveContactPreferences(found.storeId, found.email, { unsubscribeAll: true });
  else await savePlatformEmailPrefs(found.userId, Object.fromEntries(PLATFORM_TOPICS.map((t) => [t.key, false])));
  redirect(`/email/preferences/${encodeURIComponent(token)}?done=1`);
}

function Toggle({ name, label, help, defaultChecked }: { name: string; label: string; help: string; defaultChecked: boolean }) {
  return (
    <li className="border-b border-navy/[0.08] last:border-b-0">
      <label className="flex min-h-[64px] cursor-pointer items-start gap-3 py-3.5">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[#2E7E78]" />
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-navy">{label}</span>
          <span className="block text-[13.5px] leading-snug text-muted">{help}</span>
        </span>
      </label>
    </li>
  );
}

function Notice({ tone, children }: { tone: "success" | "info"; children: React.ReactNode }) {
  return (
    <div role="status" className={`mb-5 rounded-[14px] border px-4 py-3 text-[14px] ${tone === "success" ? "border-teal/30 bg-[#E6F7F3] text-[#195754]" : "border-navy/10 bg-cream text-navy"}`}>
      {children}
    </div>
  );
}

export default async function EmailPreferencesPage({ params, searchParams }: PageProps) {
  const { token: raw } = await params;
  const query = await searchParams;
  const found = target(raw);
  const token = decodeURIComponent(raw);

  let brandName = "Shopinbos";
  let logo: { src: string; alt: string; store: boolean } | null = { src: "/brand/email/shopinbos-logo-navy@2x.png", alt: "Shopinbos", store: false };
  let email = "";
  let footer: { name: string; address: string | null; privacyUrl: string | null; contactUrl: string | null };
  let body: React.ReactNode;

  if (found.kind === "contact") {
    const store = await db.store.findUnique({ where: { id: found.storeId }, select: SENDER_STORE_SELECT });
    if (!store) notFound();
    const sender = storeSender(store);
    const prefs = await contactPreferences(found.storeId, found.email);
    brandName = store.name;
    logo = store.logoUrl && /^https:\/\//.test(store.logoUrl) ? { src: store.logoUrl, alt: store.name, store: true } : null;
    email = prefs.email;
    footer = { name: sender.legalName || store.name, address: sender.address ?? null, privacyUrl: sender.privacyUrl ?? null, contactUrl: sender.contactUrl ?? null };
    const allOff = !prefs.subscribed || STORE_TOPICS.every((t) => !prefs.topics[t.key]);
    body = (
      <>
        <h1 className="m-0 font-display text-[28px] font-medium tracking-[-0.025em] text-navy">Your email preferences</h1>
        <p className="mb-5 mt-2 text-[15px] text-muted">
          Choose what <strong className="text-navy">{store.name}</strong> sends to <strong className="break-all text-navy">{email}</strong>. Order confirmations and delivery updates always arrive.
        </p>
        <form action={save}>
          <input type="hidden" name="token" value={token} />
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 p-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#195754]">Emails</legend>
            <ul className="m-0 list-none p-0">
              {STORE_TOPICS.map((topic) => (
                <Toggle key={topic.key} name={`topic_${topic.key}`} label={topic.label} help={topic.help} defaultChecked={!allOff && prefs.topics[topic.key]} />
              ))}
            </ul>
          </fieldset>
          {prefs.phone && (
            <fieldset className="m-0 mt-5 border-0 p-0">
              <legend className="mb-1 p-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#195754]">Texts to {prefs.phone.replace(/\d(?=\d{4})/g, "•")}</legend>
              <input type="hidden" name="has_sms" value="1" />
              <input type="hidden" name="has_whatsapp" value="1" />
              <ul className="m-0 list-none p-0">
                <Toggle name="sms" label="SMS offers" help="Sales and offers by text message. You can also reply STOP to any text." defaultChecked={Boolean(prefs.sms)} />
                <Toggle name="whatsapp" label="WhatsApp offers" help="Sales and offers on WhatsApp. Order updates on WhatsApp still arrive." defaultChecked={Boolean(prefs.whatsapp)} />
              </ul>
            </fieldset>
          )}
          <button type="submit" className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-pill bg-navy px-6 text-[15px] font-semibold text-cream hover:bg-[#18394A] sm:w-auto">Save preferences</button>
        </form>
      </>
    );
  } else {
    const user = await db.user.findUnique({ where: { id: found.userId }, select: { email: true, role: true } });
    if (!user) notFound();
    const prefs = await platformEmailPrefs(found.userId);
    const legal = platformLegal();
    email = user.email ?? "";
    footer = { name: legal.name, address: legal.address, privacyUrl: "https://shopinbos.com/privacy", contactUrl: "mailto:support@shopinbos.com" };
    body = (
      <>
        <h1 className="m-0 font-display text-[28px] font-medium tracking-[-0.025em] text-navy">Your Shopinbos emails</h1>
        <p className="mb-5 mt-2 text-[15px] text-muted">
          Choose what Shopinbos sends to <strong className="break-all text-navy">{email || "your account"}</strong>.
        </p>
        <form action={save}>
          <input type="hidden" name="token" value={token} />
          <ul className="m-0 list-none p-0">
            {PLATFORM_TOPICS.map((topic) => (
              <Toggle key={topic.key} name={`topic_${topic.key}`} label={topic.label} help={topic.help} defaultChecked={prefs[topic.key]} />
            ))}
          </ul>
          <div className="mt-4 rounded-[14px] bg-cream px-4 py-3 text-[13.5px] text-muted">
            <span className="font-semibold text-navy">Always sent:</span> {PLATFORM_REQUIRED.join(", ").toLowerCase()}. These keep your account safe and working.
          </div>
          <button type="submit" className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-pill bg-navy px-6 text-[15px] font-semibold text-cream hover:bg-[#18394A] sm:w-auto">Save preferences</button>
        </form>
        <p className="mb-0 mt-4 text-[13.5px] text-muted">
          New order, message and payout alerts are in your <a className="font-semibold text-[#195754] underline" href={notificationSettingsUrl(user.role)}>notification settings</a>.
        </p>
      </>
    );
  }

  const confirming = query.unsubscribe === "1" && !query.done;
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-navy sm:py-16">
      <div className="mx-auto w-full max-w-[560px]">
        <header className="mb-6 flex min-h-[44px] items-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.src} alt={logo.alt} className={logo.store ? "h-11 w-auto max-w-[200px] object-contain" : "h-5 w-auto"} />
          ) : (
            <span className="font-display text-[22px] font-semibold tracking-[-0.02em]">{brandName}</span>
          )}
        </header>
        <div className="rounded-lg border border-navy/[0.06] bg-white p-6 shadow-[0_1px_0_rgba(14,42,56,0.04)] sm:p-8">
          {query.saved && <Notice tone="success">Saved. Your choices apply from the next email.</Notice>}
          {query.done && <Notice tone="success">You&apos;re unsubscribed. {found.kind === "contact" ? `${brandName} won't send you marketing any more.` : "You'll only get account, security and billing emails."} Changed your mind? Switch anything back on below.</Notice>}
          {confirming && (
            <div className="mb-6 rounded-[14px] border border-navy/10 bg-cream p-4">
              <p className="m-0 text-[15px] font-semibold">Unsubscribe from {found.kind === "contact" ? `${brandName}'s marketing` : "Shopinbos updates"}?</p>
              <p className="mb-3 mt-1 text-[13.5px] text-muted">Or keep the emails you like and switch off the rest below.</p>
              <form action={unsubscribeAll}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="inline-flex min-h-[44px] items-center justify-center rounded-pill bg-coral px-5 text-[14px] font-semibold text-white">Unsubscribe from all</button>
              </form>
            </div>
          )}
          {body}
          {!confirming && (
            <form action={unsubscribeAll} className="mt-6 border-t border-navy/[0.08] pt-5">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold text-[#B6452E] underline">Unsubscribe from all {found.kind === "contact" ? "marketing" : "optional emails"}</button>
            </form>
          )}
        </div>
        <footer className="mt-6 text-center text-[12.5px] leading-relaxed text-muted">
          <p className="m-0 font-semibold text-navy">{footer.name}</p>
          {footer.address && <p className="m-0">{footer.address}</p>}
          <p className="mt-2">
            {footer.contactUrl && <a className="underline" href={footer.contactUrl}>Contact</a>}
            {footer.contactUrl && footer.privacyUrl && <span className="px-1.5">·</span>}
            {footer.privacyUrl && <a className="underline" href={footer.privacyUrl}>Privacy policy</a>}
          </p>
          {found.kind === "contact" && (
            <p className="mt-3 inline-flex items-center gap-1.5">
              Powered by
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/email/shopinbos-logo-navy@2x.png" alt="Shopinbos" className="h-[10px] w-auto" />
            </p>
          )}
        </footer>
      </div>
    </main>
  );
}
