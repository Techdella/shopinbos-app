"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { Card, EmptyState, ListCard, ListRow, Pill, StatGrid, StatTile, Thumb, type Tone } from "@/components/app-kit";
import { formatMoney } from "@shared/i18n";

// The reseller's page (/resell): what they may resell, "Get my link" (POST /api/app/resell/links, made once, then the
// same link), copy / share, and their sales with what the shops owe them. Data: GET /api/app/resell/market.

type Product = { productId: string; name: string; image: string | null; price: number; currency: string; commissionPct: number; commissionEach: number; storeName: string; link: string | null; clicks: number };
type Sale = { id: string; orderNumber: string | null; productName: string; storeName: string; quantity: number; lineTotal: number; commissionPct: number; commissionAmount: number; status: string; createdAt: string };
type Market = { products: Product[]; sales: Sale[]; totals: { owed: number; ready: number; paid: number; count: number; value: number } };

const STATUS_TONE: Record<string, Tone> = { pending: "warning", approved: "accent", paid: "success", void: "muted" };

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(path, { ...rest, credentials: "same-origin", headers: json !== undefined ? { "content-type": "application/json" } : undefined, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || String(response.status));
  return body?.data as T;
}

export function ResellMarket() {
  const t = useT("resell");
  const locale = useLocale();
  const [data, setData] = useState<Market | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string; tone: "error" | "success" } | null>(null);
  const money = (amount: number) => formatMoney(amount, locale);

  const load = useCallback(async () => {
    try {
      setData(await call<Market>("/api/app/resell/market"));
      setError(null);
    } catch (e) {
      setError((e as Error).message || t("loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setNote({ id, text: t("market.copied"), tone: "success" });
    } catch {
      setNote({ id, text: link, tone: "success" });
    }
  }

  async function getLink(product: Product) {
    setBusy(product.productId);
    setNote(null);
    try {
      const made = await call<{ link: string }>("/api/app/resell/links", { method: "POST", json: { productId: product.productId } });
      setData((current) => (current ? { ...current, products: current.products.map((row) => (row.productId === product.productId ? { ...row, link: made.link } : row)) } : current));
      await copy(product.productId, made.link);
    } catch (e) {
      setNote({ id: product.productId, text: (e as Error).message || t("market.linkFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function share(product: Product) {
    if (!product.link) return;
    const text = t("market.shareText", { name: product.name, link: product.link });
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await navigator.share({ text }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  if (error && !data) return <EmptyState icon="warn" title={error} />;
  if (!data) return <Card className="p-6 text-[14px] text-app-ink-soft">…</Card>;

  return (
    <div className="grid gap-6">
      <StatGrid>
        <StatTile tone="card" label={t("market.owedToYou")} value={money(data.totals.owed)} hint={t("sales.count", { count: data.totals.count })} />
        <StatTile tone="card" label={t("sales.ready")} value={money(data.totals.ready)} />
        <StatTile tone="card" label={t("sales.paid")} value={money(data.totals.paid)} />
        <StatTile tone="card" label={t("sales.amount")} value={money(data.totals.value)} />
      </StatGrid>
      <p className="m-0 text-[13.5px] text-app-ink-soft">{t("market.paidNote")}</p>

      <section className="grid gap-3">
        <h2 className="m-0 text-[18px] font-extrabold">{t("market.products")}</h2>
        {data.products.length ? (
          <ListCard>
            {data.products.map((product) => (
              <ListRow key={product.productId}>
                <Thumb src={product.image} label={product.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{product.name}</div>
                  <div className="truncate text-[13.5px] text-app-ink-soft">{t("market.from", { shop: product.storeName })} · {formatMoney(product.price, locale, { currency: product.currency })}</div>
                  <div className="text-[13.5px] font-bold text-app-success">{t("market.earn", { pct: product.commissionPct, amount: formatMoney(product.commissionEach, locale, { currency: product.currency }) })}</div>
                  {product.link ? <div className="mt-1 truncate font-mono text-[12.5px] text-app-ink-soft">{product.link} · {t("market.clicks", { count: product.clicks })}</div> : null}
                  {note?.id === product.productId ? <div role={note.tone === "error" ? "alert" : "status"} className={note.tone === "error" ? "text-[13px] text-app-danger" : "text-[13px] text-app-success"}>{note.text}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.link ? (
                    <>
                      <button type="button" onClick={() => void copy(product.productId, product.link!)} className="min-h-[40px] rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold">{t("market.copy")}</button>
                      <button type="button" onClick={() => void share(product)} className="min-h-[40px] rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">{t("market.share")}</button>
                    </>
                  ) : (
                    <button type="button" disabled={busy === product.productId} onClick={() => void getLink(product)} className="min-h-[40px] rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white disabled:opacity-60">{t("market.getLink")}</button>
                  )}
                </div>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <EmptyState icon="link" title={t("market.empty")}>{t("market.emptySub")}</EmptyState>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="m-0 text-[18px] font-extrabold">{t("market.mySales")}</h2>
        {data.sales.length ? (
          <ListCard>
            {data.sales.map((sale) => (
              <ListRow key={sale.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{sale.productName}</div>
                  <div className="truncate text-[13.5px] text-app-ink-soft">{t("market.from", { shop: sale.storeName })} · {sale.quantity} × · {money(sale.lineTotal)}</div>
                </div>
                <div className="text-right text-[15px] font-extrabold">{money(sale.commissionAmount)}</div>
                <Pill tone={STATUS_TONE[sale.status] ?? "muted"}>{t.dynamic(`status.${sale.status}`, sale.status)}</Pill>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("market.noSales")}</p>
        )}
      </section>
    </div>
  );
}
