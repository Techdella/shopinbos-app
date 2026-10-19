import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { IMPORT_STEPS, importProgress, importStatusLabel, importStepIndex, parseSourcing, type ImportRequest } from "@/lib/marketplace/find";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate, formatMoney, formatNumber, type Locale } from "@shared/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("products");
  return { title: t("imp.title") };
}

type ImportsT = Awaited<ReturnType<typeof getT<["products", "common"]>>>;

// My imports ("Imports" prototype): goods coming in from China through the sourcing partner, each with its
// step timeline and the partner's QC photos. Requests are made from Find products > China · 1688.

function detailLine(item: ImportRequest, t: ImportsT, locale: Locale) {
  return [item.quantity ? t("imp.units", { count: formatNumber(item.quantity, locale) }) : t("imp.qtyConfirm"), item.shipping === "sea" ? t("imp.sea") : t("imp.air"), item.ref].join(" · ");
}

function statusNote(item: ImportRequest, t: ImportsT, locale: Locale) {
  if (item.note) return item.note;
  if (item.status === "requested") return t("imp.quoteSoon");
  if (item.status === "in_stock") return item.updatedAt ? t("imp.addedOn", { date: formatDate(item.updatedAt, locale, { day: "numeric", month: "short" }) }) : t("imp.added");
  return "";
}

function statusText(item: ImportRequest, t: ImportsT) {
  return item.status === "requested" ? t("importStep.waiting") : t.dynamic(`importStep.${item.status}`, importStatusLabel(item.status));
}

export default async function ImportsPage({ searchParams }: { searchParams?: Promise<{ requested?: string }> }) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const t = await getT("products", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");
  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const imports = parseSourcing(settings.sourcing).imports;
  const openId = (imports.find((item) => item.status !== "in_stock" && item.status !== "requested") ?? imports[0])?.id;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("imp.title")}
      sub={t("imp.sub")}
    >
      <div className="grid gap-4">
        {params.requested && (
          <p role="status" className="m-0 flex flex-wrap items-center gap-2 rounded-[16px] bg-app-success-tint px-4 py-3 text-[14.5px] font-extrabold text-app-success">
            <Icon name="check" size={17} /> {t("imp.requestSent", { ref: params.requested })}
          </p>
        )}

        {imports.length === 0 ? (
          <EmptyState icon="truck" title={t("imp.soon")} action={<PillLink href="/marketplace" tone="ink">{t("imp.findLocal")}</PillLink>}>
            {t("imp.soonSub")}
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {imports.map((item) => {
              const stepIndex = importStepIndex(item.status);
              const done = item.status === "in_stock";
              const note = statusNote(item, t, locale);
              const image = item.qcPhotos[0] ?? item.photoUrl;
              return (
                <li key={item.id}>
                  <details open={item.id === openId} className="group rounded-[22px] border border-app-line bg-white">
                    <summary className="grid cursor-pointer list-none gap-3 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-6 [&::-webkit-details-marker]:hidden">
                      <div className="flex min-w-0 items-center gap-4">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-[14px] border border-app-line object-cover" />
                        ) : (
                          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[14px] border border-app-line bg-app-canvas text-app-ink-faint"><Icon name="package" size={22} /></span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[15.5px] font-extrabold">{item.title}</div>
                          <div className="truncate text-[13px] text-app-ink-soft">{detailLine(item, t, locale)}</div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13.5px]">
                          <span className="font-extrabold">{statusText(item, t)}</span>
                          {note && <span className="text-app-ink-soft">{note}</span>}
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-app-track" role="progressbar" aria-label={t("imp.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={importProgress(item.status)}>
                          <div className={cx("h-full rounded-full", done ? "bg-app-success" : "bg-app-accent")} style={{ width: `${Math.max(4, importProgress(item.status))}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <span className="text-[15px] font-extrabold">{item.total ? naira(item.total) : <span className="text-[13.5px] font-bold text-app-ink-soft">{t("imp.quotePending")}</span>}</span>
                        <Icon name="chevDown" size={16} className="shrink-0 text-app-ink-soft transition group-open:rotate-180" />
                      </div>
                    </summary>
                    <div className="grid gap-5 border-t border-app-line p-4 sm:p-5 md:grid-cols-[260px_minmax(0,1fr)]">
                      <ol className="m-0 grid list-none gap-2.5 p-0">
                        {IMPORT_STEPS.map((step, index) => (
                          <li key={step.key} className={cx("flex items-center gap-3 text-[14.5px]", index === stepIndex && "font-extrabold", index > stepIndex && "text-app-ink-soft")}>
                            <span
                              className={cx(
                                "h-3 w-3 shrink-0 rounded-full",
                                index < stepIndex || (done && index === stepIndex) ? "bg-app-success" : index === stepIndex ? "bg-app-accent" : "bg-app-line-strong",
                              )}
                            />
                            {t(`importStep.${step.key}`)}
                          </li>
                        ))}
                      </ol>
                      <div className="min-w-0">
                        <h3 className="m-0 text-[13.5px] font-bold text-app-ink-soft">{t("imp.qcTitle")}</h3>
                        {item.qcPhotos.length ? (
                          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                            {item.qcPhotos.map((src) => (
                              <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt={t("imp.qcPhoto")} className="h-28 w-28 rounded-[12px] border border-app-line object-cover" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">{t("imp.qcNote")}</p>
                        )}
                        {(item.link || item.photoUrl) && <div className="mt-4 flex flex-wrap gap-2">
                          {item.link && <PillLink href={item.link} size="sm" icon="link">{t("imp.listing")}</PillLink>}
                          {item.photoUrl && <PillLink href={item.photoUrl} size="sm" icon="image">{t("imp.yourPhoto")}</PillLink>}
                        </div>}
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <p className="m-0 text-[13.5px] text-app-ink-soft">
          {t("imp.nigerian")} <Link href="/home/dropship" className="font-extrabold text-app-accent-ink no-underline hover:underline">{t("imp.seeDropship")}</Link>.
        </p>
      </div>
    </SellerPage>
  );
}
