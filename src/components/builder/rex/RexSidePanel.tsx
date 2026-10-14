"use client";

import Link from "next/link";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import type { StoreHealth, StorePageStatus } from "@/lib/store-health";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";
import type { ThemeTokenSet } from "@/lib/store-templates";

type Words = ReturnType<typeof useT<["builder", "common"]>>;

function healthWord(t: Words, score: number) {
  if (score >= 85) return t("rex.sp.ready");
  if (score >= 60) return t("rex.sp.nearly");
  return t("rex.sp.starting");
}

export function RexSidePanel({
  health,
  pages,
  versions,
  busy,
  restoringId,
  storeName,
  logoUrl,
  tokens,
  onAskRex,
  onViewPage,
  onRestore,
}: {
  health: StoreHealth;
  pages: StorePageStatus[];
  versions: RexVersionSummary[];
  busy: boolean;
  restoringId: string | null;
  storeName: string;
  logoUrl: string | null;
  tokens: ThemeTokenSet;
  onAskRex: (prompt: string) => void;
  onViewPage: (page: StorePageStatus) => void;
  onRestore: (version: RexVersionSummary) => void;
}) {
  const t = useT("builder", "common");
  const suggestions = health.missing.slice(0, 3);
  const serif = tokens.headingStyle === "serif";
  // With no version recorded yet, the store as it is now is the original.
  const versionRows = versions.length
    ? versions
    : [{ id: "original", n: 1, label: t("rex.sp.original"), at: "", current: true }];

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <section aria-labelledby="rex-health" className="rounded-[22px] bg-app-ink p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="rex-health" className="m-0 text-[16px] font-extrabold">{t("rex.health")}</h2>
            <p className="m-0 mt-0.5 text-[12.5px] font-bold text-white/70">{healthWord(t, health.score)}</p>
          </div>
          <span className="text-[34px] font-extrabold leading-none tracking-[-1px]" aria-label={t("rex.sp.score", { score: health.score })}>{health.score}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health.score} aria-label={t("rex.health")}>
          <div className="h-full rounded-full bg-[#6FE3C8]" style={{ width: `${health.score}%` }} />
        </div>
        <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-white/75">{t("rex.sp.healthNote")}</p>
      </section>

      {suggestions.length ? (
        <section aria-labelledby="rex-suggests">
          <h2 id="rex-suggests" className="m-0 mb-2.5 text-[15px] font-extrabold">{t("rex.sp.suggests")}</h2>
          <ul className="m-0 list-none space-y-2 p-0">
            {suggestions.map((item) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1 text-[13.5px] font-bold leading-[1.35]">{t.dynamic(`rex.checkLabel.${item.label}`, item.label)}</span>
                  <span className="shrink-0 rounded-full bg-app-success-tint px-2 py-0.5 text-[12px] font-extrabold text-app-success">+{item.points}</span>
                </>
              );
              const className = "flex min-h-[48px] w-full items-center gap-3 rounded-[16px] bg-app-canvas px-3.5 py-2.5 text-left hover:bg-app-lilac disabled:opacity-50";
              return (
                <li key={item.id}>
                  {item.rexPrompt ? (
                    <button type="button" className={className} disabled={busy} onClick={() => onAskRex(item.rexPrompt!)}>{body}</button>
                  ) : (
                    <Link href={item.href ?? "/home"} className={className}>{body}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="m-0 rounded-[16px] bg-app-success-tint px-4 py-3 text-[13.5px] font-bold text-app-success">{t("rex.sp.allDone")}</p>
      )}

      <section aria-labelledby="rex-pages">
        <h2 id="rex-pages" className="m-0 mb-1 text-[15px] font-extrabold">{t("rex.sp.pages")}</h2>
        <ul className="m-0 list-none p-0">
          {pages.map((page) => {
            const pageName = t.dynamic(`rex.page.${page.key}`, page.label);
            return (
            <li key={page.key} className="flex min-h-[48px] items-center gap-2.5 border-b border-app-line">
              {page.state === "written" ? (
                <Icon name="check" size={16} className="shrink-0 text-app-success" aria-label={t("rex.sp.written")} />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-app-line-strong" aria-label={t("rex.sp.notWritten")} />
              )}
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{pageName}</span>
              {page.state === "written" ? (
                <button type="button" onClick={() => onViewPage(page)} className="min-h-[36px] px-1 text-[13px] font-bold text-app-ink-soft hover:text-app-ink">
                  {t("rex.view")}<span className="sr-only"> {pageName}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAskRex(`Write my ${page.label} page.`)}
                  className="min-h-[34px] rounded-full bg-app-ink px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                >
                  {t("rex.writeIt")}<span className="sr-only"> ({pageName})</span>
                </button>
              )}
            </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="rex-brand" className="rounded-[22px] border border-app-line bg-white p-3.5">
        <Link href="/home/brand-kit" className="flex items-center justify-between gap-2 rounded-[12px] px-1 py-1 hover:bg-app-canvas">
          <h2 id="rex-brand" className="m-0 text-[15px] font-extrabold">{t("rex.brandKit")}</h2>
          <Icon name="chevRight" size={16} />
        </Link>
        <div className="mt-2.5 flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: tokens.paperBg, color: tokens.ink }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={t("rex.sp.logoAlt", { name: storeName })} className="h-8 max-w-[120px] object-contain" />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[17px]" style={serif ? { fontFamily: "Fraunces, Georgia, serif", fontStyle: "italic" } : { fontWeight: 800 }}>{storeName}</span>
          )}
          <span className="ml-auto flex shrink-0 gap-1.5" aria-label={t("rex.sp.colours")}>
            {[tokens.heroBg, tokens.accent, tokens.ctaBg].map((colour, index) => (
              <span key={`${colour}-${index}`} className="h-6 w-6 rounded-full border border-black/10" style={{ background: colour }} title={colour} />
            ))}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[13px] font-bold">
          <Link href="/studio/logo" className="inline-flex min-h-[32px] items-center text-app-ink-soft hover:text-app-ink">{t("rex.makeLogo")}</Link>
          <Link href="/studio/images" className="inline-flex min-h-[32px] items-center text-app-ink-soft hover:text-app-ink">{t("rex.makeImages")}</Link>
        </div>
      </section>

      <section aria-labelledby="rex-versions">
        <h2 id="rex-versions" className="m-0 mb-1 text-[15px] font-extrabold">{t("rex.sp.versions")}</h2>
        <ul className="m-0 list-none p-0">
          {versionRows.map((version) => (
            <li key={version.id} className="flex min-h-[48px] items-center gap-2.5 border-b border-app-line">
              <span className="shrink-0 rounded-full bg-app-canvas px-2 py-0.5 text-[12px] font-extrabold">v{version.n}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px]" title={version.label}>{version.label}</span>
              {version.current ? (
                <span className="shrink-0 text-[12.5px] font-bold text-app-ink-soft">{t("rex.sp.now")}</span>
              ) : (
                <button
                  type="button"
                  disabled={busy || restoringId !== null}
                  onClick={() => onRestore(version)}
                  className={cx("min-h-[36px] shrink-0 px-1 text-[13px] font-bold text-app-accent-ink hover:underline disabled:opacity-50")}
                >
                  {restoringId === version.id ? t("rex.sp.restoring") : t("rex.sp.restore")}
                  <span className="sr-only"> {t("rex.versionN", { n: version.n })}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        {versions.length && !versions.some((version) => version.current) ? (
          <p className="m-0 mt-2 text-[12.5px] leading-[1.45] text-app-ink-soft">{t("rex.sp.unsaved")}</p>
        ) : null}
      </section>
    </div>
  );
}
