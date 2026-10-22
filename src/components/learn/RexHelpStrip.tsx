"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mascot } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// "Rex is here to help" on the store pages (Your store and everything under it, brand kit, media, templates,
// domain): what Rex can do on this page and a button or two that open him on it, in the builder (menus, sections)
// or in Rex Studio with the request written for the seller. Shown in the seller page header.

type HelpAction = { label: string; href: string };
type Help = { key: string; actions: Array<{ key: string; href: string }> };

const studio = (prompt: string) => `/studio?prompt=${encodeURIComponent(prompt)}`;

/** The store pages Rex helps on, longest path first so /home/commerce/cart wins over /home. */
const HELP: Array<[string, Help]> = [
  ["/home/navigation", { key: "menus", actions: [{ key: "menusDesign", href: "/seller/store/builder?rex=menu" }] }],
  ["/home/pages", { key: "pages", actions: [{ key: "pagesWrite", href: studio("Write my About page and FAQ in my brand voice") }, { key: "editWithRex", href: "/seller/store/builder?rex=page" }] }],
  ["/home/cms", { key: "content", actions: [{ key: "contentPlan", href: "/home/cms/plan" }, { key: "contentWrite", href: studio("Write a blog post for my store about ") }] }],
  ["/home/checkout", { key: "checkout", actions: [{ key: "checkoutWords", href: studio("Make my checkout page clearer and more trustworthy for first-time buyers") }] }],
  ["/home/commerce/cart", { key: "cart", actions: [{ key: "cartWords", href: studio("Write friendlier words for my cart and wishlist") }] }],
  ["/home/seo", { key: "seo", actions: [{ key: "seoWrite", href: studio("Write SEO titles and descriptions for my store pages and products") }] }],
  ["/home/legal", { key: "legal", actions: [{ key: "legalDraft", href: studio("Draft my returns and refund policy") }] }],
  ["/home/brand-kit", { key: "brand", actions: [{ key: "brandLogo", href: "/studio/logo" }, { key: "brandBook", href: studio("Make a brand book for my store: colours, fonts and voice") }] }],
  ["/home/media", { key: "media", actions: [{ key: "mediaPictures", href: "/studio/images" }] }],
  ["/home/domain", { key: "domain", actions: [{ key: "domainIdeas", href: studio("Suggest short, memorable domain names for my store") }] }],
  ["/builder/templates", { key: "templates", actions: [{ key: "templatesPick", href: studio("Which theme suits my store best? Show me") }] }],
  ["/home/store", { key: "store", actions: [{ key: "editWithRex", href: "/seller/store/builder?rex=page" }, { key: "storeRebrand", href: studio("Refresh my store's look: colours, fonts and the home page") }] }],
];

export function rexHelpFor(pathname: string | null): Help | null {
  if (!pathname) return null;
  const match = HELP.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  // Inside Content › Plan with Rex, Rex is already the page.
  if (!match || pathname.startsWith("/home/cms/plan")) return null;
  return match[1];
}

export function RexHelpStrip({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const t = useT("learn");
  const help = rexHelpFor(pathname);
  if (!help) return null;
  const actions: HelpAction[] = help.actions.map((action) => ({ label: t.dynamic(`rexhelp.act.${action.key}`, action.key), href: action.href }));
  return (
    <aside aria-label={t("rexhelp.aria")} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] border border-app-line bg-app-mint/40 px-3 py-2.5 ${className}`}>
      <Mascot name="rex" className="h-9 w-9 shrink-0" alt="" />
      <p className="m-0 min-w-0 flex-1 basis-[240px] text-[13.5px] leading-[1.45] text-app-ink">
        <strong>{t("rexhelp.title")}</strong> {t.dynamic(`rexhelp.page.${help.key}`, "")}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <Link
            key={action.href}
            href={action.href}
            className={index === 0
              ? "inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-extrabold text-white no-underline hover:bg-black"
              : "inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong"}
          >
            {index === 0 ? <Icon name="sparkle" size={14} /> : null}
            {action.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
