"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput, Toggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Thumb } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "@shared/i18n";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { BUNDLE_MAX_ITEMS, BUNDLE_MAX_QUANTITY, bundleAvailable, bundleDraftProblem, bundleSaving, partsTotal } from "@shared/bundles";

// The web's "Make a bundle" / "Edit bundle" form (/products/bundles/new, /products/bundles/[id]): pick 2 to 10 of the
// store's own products and how many of each, one price (the parts' total and the saving show as the seller types),
// a name, a photo (the first product's unless another is picked) and whether it shows in the store. Saves with POST
// or PATCH /api/store/products/bundles (rules in shared/bundles.ts).

export interface BundleChoice {
  id: string;
  name: string;
  images: string[];
  retailPrice: number;
  status: string;
  /** Units left when the seller counts stock; null when not counted. */
  stock: number | null;
}

export interface BundleFormInitial {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  status: string;
  items: Array<{ productId: string; quantity: number }>;
}

const card = "rounded-[22px] border border-app-line bg-white p-5";

export function BundleForm({ choices, initial }: { choices: BundleChoice[]; initial?: BundleFormInitial | null }) {
  const t = useT("bundles", "common");
  const locale = useLocale();
  const naira = (value: number) => formatMoney(Math.round(value), locale);
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [items, setItems] = useState(initial?.items ?? []);
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [publish, setPublish] = useState(initial ? initial.status === "published" : true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const byId = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const total = partsTotal(items, (id) => byId.get(id)?.retailPrice);
  const amount = Number(price.replace(/[^\d.]/g, ""));
  const priceValue = price.trim() && Number.isFinite(amount) ? amount : null;
  const saving = bundleSaving(total, priceValue ?? 0);
  // How many can sell with the stock now (published items that count stock).
  const canSell = bundleAvailable(items, (id) => {
    const choice = byId.get(id);
    return choice ? { status: choice.status, trackStock: choice.stock !== null, currentStock: choice.stock ?? 0 } : null;
  });
  const photos = [...new Set(items.flatMap((item) => byId.get(item.productId)?.images.slice(0, 1) ?? []))];
  const shownImage = image ?? photos[0] ?? null;
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return choices.filter((choice) => !items.some((item) => item.productId === choice.id) && (!needle || choice.name.toLowerCase().includes(needle))).slice(0, 8);
  }, [choices, items, search]);

  function change(productId: string, quantity: number) {
    setError(null);
    setItems((current) => (quantity <= 0 ? current.filter((item) => item.productId !== productId) : current.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(BUNDLE_MAX_QUANTITY, quantity) } : item))));
  }

  async function save() {
    const problem = bundleDraftProblem({ name, price: priceValue, items });
    if (problem) return setError(t(`problem.${problem as "name" | "price" | "too_few" | "too_many" | "quantity"}`));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(initial ? `/api/store/products/bundles/${initial.id}` : "/api/store/products/bundles", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, price: priceValue, items, image: image ?? "", publish }),
      });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message || t("problem.couldNot"));
      router.push("/products/bundles");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("problem.couldNot"));
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    setBusy(true);
    const response = await fetch(`/api/store/products/${initial.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      setRemoving(false);
      return setError(t("problem.couldNot"));
    }
    router.push("/products/bundles");
    router.refresh();
  }

  return (
    <div className="grid max-w-[760px] gap-4">
      <section className={cx(card, "grid gap-4")}>
        <div>
          <FieldLabel htmlFor="bundle-name">{t("form.name")}</FieldLabel>
          <TextInput id="bundle-name" value={name} maxLength={120} placeholder={t("form.namePlaceholder")} onChange={(event) => { setName(event.target.value); setError(null); }} />
        </div>
        <div>
          <FieldLabel htmlFor="bundle-description">{t("form.description")}</FieldLabel>
          <textarea
            id="bundle-description"
            value={description}
            maxLength={5000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-[16px] border border-app-line bg-white px-4 py-3 text-[16px] text-app-ink outline-none transition focus:border-app-ink"
          />
        </div>
      </section>

      <section className={cx(card, "grid gap-3")} aria-labelledby="bundle-items">
        <div>
          <h2 id="bundle-items" className="m-0 text-[17px] font-extrabold">{t("form.items")}</h2>
          <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("form.itemsHint")}</p>
        </div>
        {items.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {items.map((item) => {
              const choice = byId.get(item.productId);
              return (
                <li key={item.productId} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-app-line px-3 py-2.5">
                  <Thumb src={choice?.images[0]} label={choice?.name ?? "?"} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[14.5px] font-bold">{choice?.name ?? "…"}</p>
                    <p className="m-0 text-[12.5px] text-app-ink-soft">
                      {naira(choice?.retailPrice ?? 0)} · {choice?.stock === null || !choice ? t("form.stockOff") : t("form.stockLeft", { count: Math.max(0, choice.stock) })}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5" aria-label={t("form.quantity")}>
                    <button type="button" aria-label={`− ${choice?.name ?? ""}`} disabled={item.quantity <= 1} onClick={() => change(item.productId, item.quantity - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-app-line disabled:opacity-40">−</button>
                    <span className="min-w-6 text-center text-[15px] font-extrabold">{item.quantity}</span>
                    <button type="button" aria-label={`+ ${choice?.name ?? ""}`} disabled={item.quantity >= BUNDLE_MAX_QUANTITY} onClick={() => change(item.productId, item.quantity + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-app-line disabled:opacity-40">+</button>
                  </span>
                  <button type="button" aria-label={t("form.remove")} onClick={() => change(item.productId, 0)} className="grid h-9 w-9 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas">
                    <Icon name="x" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {choices.length < 2 ? (
          <Notice tone="info">{t("form.noChoices")}</Notice>
        ) : items.length < BUNDLE_MAX_ITEMS ? (
          <div className="grid gap-2">
            <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("form.search")} aria-label={t("form.search")} />
            {matches.length ? (
              <ul className="m-0 grid list-none gap-1 p-0">
                {matches.map((choice) => (
                  <li key={choice.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setItems((current) => [...current, { productId: choice.id, quantity: 1 }]);
                        setSearch("");
                        setError(null);
                      }}
                      className="flex w-full items-center gap-3 rounded-[14px] px-2 py-1.5 text-left hover:bg-app-canvas"
                    >
                      <Thumb src={choice.images[0]} label={choice.name} size={36} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{choice.name}</span>
                      <span className="text-[13px] text-app-ink-soft">{naira(choice.retailPrice)}</span>
                      <Icon name="plus" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[13.5px] text-app-ink-soft">{t("form.noMatch")}</p>
            )}
          </div>
        ) : null}
      </section>

      <section className={cx(card, "grid gap-3")}>
        <div>
          <FieldLabel htmlFor="bundle-price">{t("form.price")}</FieldLabel>
          <TextInput id="bundle-price" inputMode="decimal" value={price} onChange={(event) => { setPrice(event.target.value.replace(/[^\d.,]/g, "")); setError(null); }} placeholder={total > 0 ? String(Math.round(total)) : ""} />
        </div>
        {items.length ? (
          <div className="grid gap-1 text-[14px]">
            <p className="m-0 text-app-ink-soft">{t("form.separately", { amount: naira(total) })}</p>
            {priceValue && saving.amount > 0 ? (
              <p className="m-0 font-bold text-app-success">{t("form.saving", { amount: naira(saving.amount), percent: saving.percent })}</p>
            ) : total > 0 ? (
              <p className="m-0 text-app-ink-soft">{t("form.noSaving", { amount: naira(total) })}</p>
            ) : null}
            {canSell !== null ? <p className="m-0 text-app-ink-soft">{t("form.canSell", { count: canSell })}</p> : null}
          </div>
        ) : null}
      </section>

      {photos.length ? (
        <section className={cx(card, "grid gap-3")} aria-labelledby="bundle-photo">
          <div>
            <h2 id="bundle-photo" className="m-0 text-[17px] font-extrabold">{t("form.photo")}</h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("form.photoHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...(image && !photos.includes(image) ? [image] : []), ...photos])].map((src) => (
              <button
                key={src}
                type="button"
                aria-pressed={src === shownImage}
                onClick={() => setImage(src === photos[0] ? null : src)}
                className={cx("overflow-hidden rounded-[14px] border-2", src === shownImage ? "border-app-ink" : "border-transparent")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" width={72} height={72} className="h-[72px] w-[72px] object-cover" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className={cx(card, "flex items-center justify-between gap-4")}>
        <span className="text-[15px] font-bold">{t("form.publish")}</span>
        <Toggle on={publish} onChange={setPublish} label={t("form.publish")} />
      </section>

      {error ? <Notice>{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <PillButton tone="ink" size="md" busy={busy} onClick={() => void save()}>{t("form.save")}</PillButton>
        {initial ? <PillButton tone="white" size="md" disabled={busy} onClick={() => setRemoving(true)}>{t("form.removeBundle")}</PillButton> : null}
      </div>
      <ConfirmDialog open={removing} title={t("form.removeBundle")} message={t("form.removeConfirm")} confirmLabel={t("form.removeBundle")} variant="danger" loading={busy} onConfirm={() => void remove()} onCancel={() => setRemoving(false)} />
    </div>
  );
}
