"use client";

import Link from "next/link";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { contextHref, formatBytes, roleLabel, type ContextSnapshot, type PartnerRole, type ThreadAttachment } from "@/lib/conversations/pure";
import { useT } from "@/components/i18n/I18nProvider";
import { APP_TIME_ZONE, formatRelative, intlLocale, type Locale } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

// Small pieces of the partner messenger: logo/initials avatar, role badge, linked-item cards, files.

const AVATAR_TINTS = ["bg-app-peach text-app-accent-ink", "bg-app-mint text-app-forest", "bg-app-lilac text-app-ink", "bg-app-canvas text-app-ink"];

export function PartnerAvatar({ name, logoUrl, size = 40 }: { name: string; logoUrl?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "·";
  const tint = AVATAR_TINTS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center overflow-hidden rounded-full font-extrabold", !logoUrl && tint)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

const ROLE_TONE: Record<PartnerRole, string> = {
  supplier: "bg-app-mint text-app-forest",
  logistics_partner: "bg-[#FDF0D5] text-[#8A5A00]",
  seller: "bg-app-peach text-app-accent-ink",
  admin: "bg-app-lilac text-app-ink",
};

/** roleLabel() in the person's language. */
export function useRoleLabel() {
  const t = useT("inbox");
  return (role: string | null | undefined) => t.dynamic(`partnerRole.${role ?? "seller"}`, roleLabel(role));
}

export function RoleBadge({ role }: { role: PartnerRole }) {
  const label = useRoleLabel();
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", ROLE_TONE[role] ?? ROLE_TONE.seller)}>{label(role)}</span>;
}

const CONTEXT_ICON: Record<ContextSnapshot["kind"], IconName> = { product: "bag", order: "package", wholesale_order: "box", booking: "truck" };
const CONTEXT_EYEBROW: Record<ContextSnapshot["kind"], MessageKey<"inbox">> = { product: "ctx.product", order: "ctx.order", wholesale_order: "ctx.wholesale", booking: "ctx.booking" };

/** A linked product/order/booking, shown in the thread and above the composer. */
export function ContextCard({ context, viewerRole, mine = false, onRemove }: { context: ContextSnapshot; viewerRole: PartnerRole; mine?: boolean; onRemove?: () => void }) {
  const t = useT("inbox");
  const href = onRemove ? null : contextHref(viewerRole, context);
  const body = (
    <>
      {context.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={context.image} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" />
      ) : (
        <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-[10px]", mine ? "bg-white/15" : "bg-app-canvas text-app-ink-soft")}>
          <Icon name={CONTEXT_ICON[context.kind]} size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={cx("block text-[10.5px] font-bold uppercase tracking-[0.08em]", mine ? "text-white/65" : "text-app-ink-faint")}>{t(CONTEXT_EYEBROW[context.kind])}</span>
        <span className="block truncate text-[13.5px] font-extrabold">{context.label}</span>
        {context.sub && <span className={cx("block truncate text-[12px]", mine ? "text-white/75" : "text-app-ink-soft")}>{context.sub}</span>}
      </span>
      {href && <Icon name="chevRight" size={14} className="shrink-0 opacity-60" />}
    </>
  );
  const shell = cx("flex w-full min-w-0 items-center gap-2.5 rounded-[14px] p-2 no-underline", mine ? "bg-white/10 text-white" : "border border-app-line bg-white text-app-ink");
  return (
    <div className="relative min-w-0">
      {href ? <Link href={href} className={cx(shell, "hover:brightness-[0.98]")}>{body}</Link> : <div className={shell}>{body}</div>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t("ctx.remove", { label: context.label })} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-app-line bg-white text-app-ink-soft shadow-sm hover:text-app-ink">
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

/** Photos as thumbnails, PDFs as file rows. URLs go through the API, which checks the viewer is in the chat. */
export function Attachments({ files, mine }: { files: Array<ThreadAttachment & { previewUrl?: string }>; mine: boolean }) {
  if (!files.length) return null;
  const photos = files.filter((file) => file.type.startsWith("image/"));
  const docs = files.filter((file) => !file.type.startsWith("image/"));
  return (
    <div className="grid gap-1.5">
      {photos.length > 0 && (
        <div className={cx("grid gap-1.5", photos.length > 1 && "grid-cols-2")}>
          {photos.map((file, index) => {
            const src = file.previewUrl || file.url;
            return src ? (
              <a key={`${file.name}-${index}`} href={file.url || src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={file.name} className="max-h-[220px] w-full object-cover" loading="lazy" />
              </a>
            ) : null;
          })}
        </div>
      )}
      {docs.map((file, index) => (
        <a
          key={`${file.name}-${index}`}
          href={file.url || undefined}
          target="_blank"
          rel="noreferrer"
          className={cx("flex min-w-0 items-center gap-2 rounded-[12px] px-2.5 py-2 no-underline", mine ? "bg-white/10 text-white" : "border border-app-line bg-white text-app-ink")}
        >
          <Icon name="file" size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{file.name}</span>
          <span className={cx("shrink-0 text-[11.5px]", mine ? "text-white/65" : "text-app-ink-faint")}>{formatBytes(file.size)}</span>
        </a>
      ))}
    </div>
  );
}

/** Where to find people to message, per portal. */
export function EmptyPartners({ role, compact = false }: { role: PartnerRole; compact?: boolean }) {
  const t = useT("inbox");
  const links: Array<{ href: string; label: string; icon: IconName }> =
    role === "seller"
      ? [
          { href: "/marketplace/suppliers", label: t("partner.findSuppliers"), icon: "search" },
          { href: "/marketplace/logistics", label: t("partner.findPartners"), icon: "truck" },
        ]
      : role === "supplier"
        ? [
            { href: "/supplier/products", label: t("empty.yourProducts"), icon: "bag" },
            { href: "/supplier/orders", label: t("empty.orders"), icon: "package" },
          ]
        : [{ href: "/logistics/bookings", label: t("empty.yourJobs"), icon: "truck" }];
  const text = role === "seller" ? t("empty.seller") : role === "supplier" ? t("empty.supplier") : t("empty.logistics");
  return (
    <div className={cx("flex flex-col items-center px-6 text-center", compact ? "py-10" : "py-14")}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="chat" size={22} /></span>
      <h3 className="mb-0 mt-4 text-[17px] font-extrabold">{t("list.emptyTitle")}</h3>
      <p className="mb-0 mt-1.5 max-w-[360px] text-[14px] leading-[1.55] text-app-ink-soft">{text}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {links.map((link, index) => (
          <Link
            key={link.href}
            href={link.href}
            className={cx(
              "inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-extrabold no-underline transition",
              index === 0 ? "bg-app-ink text-white hover:bg-black" : "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
            )}
          >
            <Icon name={link.icon} size={14} /> {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function formatClock(iso: string, locale: Locale = "en") {
  return new Date(iso).toLocaleTimeString(locale === "en" ? "en-GB" : intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

/** List time: "14:05" today, "Mon" this week, "12 Oct" before that. */
export function formatListTime(iso: string, now = Date.now(), locale: Locale = "en") {
  const date = new Date(iso);
  const diff = now - date.getTime();
  const tag = locale === "en" ? "en-GB" : intlLocale(locale);
  if (diff < 60_000) return locale === "en" ? "now" : formatRelative(date, locale, now);
  if (diff < 86_400_000 && new Date(now).toDateString() === date.toDateString()) return formatClock(iso, locale);
  if (diff < 6 * 86_400_000) return date.toLocaleDateString(tag, { weekday: "short", timeZone: APP_TIME_ZONE });
  return date.toLocaleDateString(tag, { day: "numeric", month: "short", timeZone: APP_TIME_ZONE });
}
