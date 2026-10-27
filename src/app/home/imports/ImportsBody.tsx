import type { ReactNode } from "react";
import Link from "next/link";
import type { ImportOrder } from "@prisma/client";
import { EmptyState, PillLink } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { IMPORT_PARTNER, IMPORT_STEPS, importProgress, importStepIndex, isImportOpen, isImportStatus, parseImportEvents, quoteOpen, stepTimes, type ImportStatus } from "@/lib/imports/pure";
import type { getT } from "@/lib/i18n/server";
import { formatDate, formatMoney, formatNumber, type Locale } from "@shared/i18n";
import { ImportActions, type ImportActionLabels } from "./ImportActions";

// My imports, the list (the page loads it): each import with its quote, step timeline, tracking and QC photos.

export type ImportRow = ImportOrder;

type ImportsT = Awaited<ReturnType<typeof getT<["products", "common"]>>>;
type Row = ImportRow;

function detailLine(item: Row, t: ImportsT, locale: Locale) {
  return [item.quantity ? t("imp.units", { count: formatNumber(item.quantity, locale) }) : t("imp.qtyConfirm"), item.shipping === "sea" ? t("imp.sea") : t("imp.air"), item.ref].join(" · ");
}

function statusText(status: ImportStatus, t: ImportsT) {
  return status === "requested" ? t("importStep.waiting") : t(`importStep.${status}`);
}

function statusNote(item: Row, status: ImportStatus, t: ImportsT, locale: Locale) {
  const short = (value: Date) => formatDate(value, locale, { day: "numeric", month: "short" });
  if (item.partnerNote) return item.partnerNote;
  if (status === "requested") return t("imp.quoteSoon");
  if (status === "in_stock") return item.deliveredAt ? t("imp.addedOn", { date: short(item.deliveredAt) }) : t("imp.added");
  if (item.estimatedArrival && isImportOpen(status)) return t("imp.arrives", { date: short(item.estimatedArrival) });
  return "";
}

const importStatus = (item: Row): ImportStatus => (isImportStatus(item.status) ? item.status : "requested");

export function ImportsBody({ imports, open, openId, requested, labels, tip, t, locale }: { imports: Row[]; open: boolean; openId: string | undefined; requested?: string; labels: ImportActionLabels; /** The page tip (only while imports are coming soon: once open, the subtitle explains them). */ tip: ReactNode; t: ImportsT; locale: Locale }) {
  const naira = (amount: number | null) => formatMoney(Math.round(amount ?? 0), locale);
  return (
      <div className="grid gap-4">
        {tip}
        {requested && (
          <p role="status" className="m-0 flex flex-wrap items-center gap-2 rounded-[16px] bg-app-success-tint px-4 py-3 text-[14.5px] font-extrabold text-app-success">
            <Icon name="check" size={17} /> {t("imp.requestSent", { ref: requested })}
          </p>
        )}
        {imports.length === 0 ? (
          open ? (
            <EmptyState icon="globe" title={t("imp.empty")} action={<PillLink href="/marketplace?tab=china" tone="ink">{t("imp.new")}</PillLink>}>
              {t("imp.emptySub")}
            </EmptyState>
          ) : (
            <EmptyState icon="truck" title={t("imp.soon")} action={<PillLink href="/marketplace" tone="ink">{t("imp.findLocal")}</PillLink>}>
              {t("imp.soonSub")}
            </EmptyState>
          )
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {imports.map((item) => {
              const status = importStatus(item);
              const closed = status === "declined" || status === "cancelled";
              const stepIndex = importStepIndex(status);
              const done = status === "in_stock";
              const note = statusNote(item, status, t, locale);
              const image = item.qcPhotos[0] ?? item.photoUrl;
              const times = stepTimes(parseImportEvents(item.events));
              const canAccept = quoteOpen({ status, quoteValidUntil: item.quoteValidUntil });
              const expired = status === "quoted" && !canAccept;
              return (
                <li key={item.id} id={item.id}>
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
                          <span className={cx("font-extrabold", status === "quoted" && canAccept && "text-app-accent-ink")}>{statusText(status, t)}</span>
                          {note && <span className="text-app-ink-soft">{note}</span>}
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-app-track" role="progressbar" aria-label={t("imp.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={importProgress(status)}>
                          <div className={cx("h-full rounded-full", done ? "bg-app-success" : closed ? "bg-app-line-strong" : "bg-app-accent")} style={{ width: `${closed ? 100 : Math.max(4, importProgress(status))}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <span className="text-[15px] font-extrabold">{item.total ? naira(item.total) : <span className="text-[13.5px] font-bold text-app-ink-soft">{t("imp.quotePending")}</span>}</span>
                        <Icon name="chevDown" size={16} className="shrink-0 text-app-ink-soft transition group-open:rotate-180" />
                      </div>
                    </summary>
                    <div className="grid gap-5 border-t border-app-line p-4 sm:p-5 md:grid-cols-[260px_minmax(0,1fr)]">
                      <ol className="m-0 grid list-none content-start gap-2.5 p-0">
                        {IMPORT_STEPS.map((step, index) => {
                          const passed = !closed && (index < stepIndex || (done && index === stepIndex));
                          const here = !closed && index === stepIndex && !done;
                          return (
                            <li key={step.key} className={cx("flex items-center gap-3 text-[14.5px]", here && "font-extrabold", (closed || index > stepIndex) && "text-app-ink-soft")}>
                              <span className={cx("h-3 w-3 shrink-0 rounded-full", passed ? "bg-app-success" : here ? "bg-app-accent" : "bg-app-line-strong")} />
                              <span className="min-w-0 flex-1">{t(`importStep.${step.key}`)}</span>
                              {times[step.key] && (passed || here) ? <span className="text-[12px] font-normal text-app-ink-soft">{formatDate(times[step.key]!, locale, { day: "numeric", month: "short" })}</span> : null}
                            </li>
                          );
                        })}
                        {closed ? (
                          <li className="flex items-center gap-3 text-[14.5px] font-extrabold">
                            <span className="h-3 w-3 shrink-0 rounded-full bg-app-ink" />
                            {t(`importStep.${status}`)}
                          </li>
                        ) : null}
                      </ol>
                      <div className="grid min-w-0 content-start gap-5">
                        {item.total ? (
                          <section className="rounded-[18px] border border-app-line p-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <h3 className="m-0 text-[15px] font-extrabold">{t("imp.quoteTitle")}</h3>
                              {status === "quoted" && item.quoteValidUntil ? (
                                <span className={cx("text-[12.5px] font-bold", expired ? "text-app-danger" : "text-app-ink-soft")}>
                                  {expired ? t("imp.expired") : t("imp.validUntil", { date: formatDate(item.quoteValidUntil, locale, { day: "numeric", month: "short" }) })}
                                </span>
                              ) : null}
                            </div>
                            <dl className="m-0 mt-3 grid gap-1.5 text-[14px]">
                              {[
                                [t("imp.goods", { count: formatNumber(item.quantity ?? 0, locale), price: naira(item.unitPrice) }), item.goodsTotal],
                                [t("imp.freight"), item.freight],
                                [t("imp.customs"), item.customs],
                                [t("imp.serviceFee"), item.serviceFee],
                              ].map(([label, value]) => (
                                <div key={label as string} className="flex justify-between gap-3">
                                  <dt className="text-app-ink-soft">{label}</dt>
                                  <dd className="m-0 font-semibold">{naira(value as number | null)}</dd>
                                </div>
                              ))}
                              <div className="mt-1 flex justify-between gap-3 border-t border-app-line pt-2.5 text-[15.5px] font-extrabold">
                                <dt>{t("imp.total")}</dt>
                                <dd className="m-0">{naira(item.total)}</dd>
                              </div>
                            </dl>
                            <p className="mb-0 mt-1 text-right text-[12.5px] text-app-ink-soft">
                              {item.quantity ? t("imp.perUnit", { price: naira(item.total / item.quantity) }) : null}
                              {item.estimatedArrival ? ` · ${t("imp.arrives", { date: formatDate(item.estimatedArrival, locale, { day: "numeric", month: "short" }) })}` : null}
                            </p>
                            {item.quoteNote ? <p className="mb-0 mt-3 rounded-[12px] bg-app-canvas p-3 text-[13.5px]">{item.quoteNote}</p> : null}
                            {status === "quoted" && item.acceptedAt ? <p className="mb-0 mt-3 text-[13.5px] font-bold text-app-success">{t("imp.accepted")}</p> : null}
                            {status === "quoted" && canAccept && !item.paymentUrl ? <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{t("imp.noPayLink")}</p> : null}
                            {status === "declined" ? <p className="mb-0 mt-3 text-[13.5px] font-bold text-app-ink-soft">{t("imp.declined")}</p> : null}
                            {status === "quoted" || status === "quote_paid" ? (
                              <p className="mb-0 mt-3 flex items-center gap-2 text-[12.5px] text-app-ink-soft"><Icon name="shield" size={14} /> {t("imp.escrowNote")}</p>
                            ) : null}
                          </section>
                        ) : null}
                        {status === "cancelled" ? <p className="m-0 text-[13.5px] font-bold text-app-ink-soft">{t("imp.cancelledNote")}</p> : null}
                        <ImportActions
                          id={item.id}
                          labels={labels}
                          total={item.total ? naira(item.total) : null}
                          paymentUrl={item.paymentUrl}
                          canAccept={canAccept}
                          accepted={Boolean(item.acceptedAt)}
                          canCancel={status === "requested" || (status === "quoted" && !item.paidAt)}
                          canAdd={done}
                          storeProductId={item.storeProductId}
                        />
                        {item.trackingNumber ? (
                          <p className="m-0 flex items-center gap-2 text-[13.5px]"><Icon name="truck" size={15} /> {t("imp.tracking", { carrier: item.carrier ?? "", number: item.trackingNumber })}</p>
                        ) : null}
                        <div>
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
                        </div>
                        {item.notes ? <p className="m-0 whitespace-pre-line text-[13.5px]"><span className="font-bold">{t("imp.yourNotes")}: </span>{item.notes}</p> : null}
                        {(item.link || item.photoUrl) && (
                          <div className="flex flex-wrap gap-2">
                            {item.link && <PillLink href={item.link} size="sm" icon="link">{t("imp.viewListing")}</PillLink>}
                            {item.photoUrl && <PillLink href={item.photoUrl} size="sm" icon="image">{t("imp.yourPhoto")}</PillLink>}
                          </div>
                        )}
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
          {open ? <span className="ml-1">{IMPORT_PARTNER.name} · <a href={IMPORT_PARTNER.site} target="_blank" rel="noreferrer" className="text-app-ink-soft">shopkonfam.com</a></span> : null}
        </p>
      </div>
  );
}
