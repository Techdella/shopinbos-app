"use client";

/* eslint-disable @next/next/no-img-element -- the seller's own product photos. */

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx, FieldLabel, Notice, PillButton, Spinner, TextInput } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { suggestedRetailPrice } from "@shared/onboarding";
import {
  addSupplierPick,
  createProducts,
  draftProducts,
  fetchMarketplaceProduct,
  saveCategories,
  updateProduct,
  type OnboardingProduct,
} from "./api";
import { RexFrame, RexHead, RexSays } from "./Frame";
import { Dialog, ProductTile, SourceButton } from "./parts";
import type { StepCtx } from "./context";

// The plan (D0, design RB-02), products (D1a, RB-03) and categories (D1b, RB-04) on the web. Photos come from the
// computer (upload or drag in) or, on a phone browser, straight from the camera; Rex writes each product from its
// photo with the web's existing product-drafts AI (POST /api/ai/product-drafts, up to six at a time).

const PLAN: { key: "products" | "style" | "home" | "pages" | "golive"; min: number | null; tint: string; ink: string }[] = [
  { key: "products", min: 1, tint: "#FFEDE4", ink: "#B23E0A" },
  { key: "style", min: 1, tint: "#ECEAFB", ink: "#4B3FC4" },
  { key: "home", min: 2, tint: "#E2F6F1", ink: "#0C4A44" },
  { key: "pages", min: 1, tint: "#FDF0D5", ink: "#8A5A08" },
  { key: "golive", min: null, tint: "#E2F5EA", ink: "#16794A" },
];

/** At most six photos per read (the product-drafts route's own limit). */
const PHOTOS_AT_ONCE = 6;

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** D0 "Hi Ada! Let's build your shop together." with the five steps and their times. */
export function PlanStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const name = ctx.flow.firstName || ctx.data.owner.firstName;
  return (
    <RexFrame {...ctx.frame} step={0} close primary={{ title: t("plan.go"), onPress: () => void ctx.next({ buildStartedAt: new Date().toISOString() }), testId: "plan-go" }}>
      <div className="flex flex-col items-center gap-3.5 text-center">
        <RexHead size={112} />
        <h1 className="m-0 text-[28px] font-extrabold leading-[1.15] tracking-[-0.5px] sm:text-[34px]">{name ? t("plan.title", { name }) : t("plan.titleNoName")}</h1>
        <p className="m-0 text-[16px] leading-[1.45] text-app-ink-soft">{ctx.mode === "redesign" ? t("plan.redesign") : t("plan.sub")}</p>
      </div>
      <ol className="m-0 list-none rounded-[24px] border border-app-line bg-white px-[18px] py-0">
        {PLAN.filter((row) => ctx.mode !== "redesign" || row.key !== "products").map((row, index, rows) => (
          <li key={row.key} className={cx("flex min-h-[58px] items-center gap-3.5", index < rows.length - 1 && "border-b border-app-line")}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-extrabold" style={{ background: row.tint, color: row.ink }}>{index + 1}</span>
            <span className="min-w-0 flex-1 text-[16px] font-bold">{t.dynamic(`plan.${row.key}`, row.key)}</span>
            {row.min ? <span className="shrink-0 text-[14px] text-app-ink-soft">{t("plan.min", { count: row.min })}</span> : null}
          </li>
        ))}
      </ol>
    </RexFrame>
  );
}

/** Name and price for one product (the price check), saved through the products route. */
export function ProductDialog({ product, onClose, onSaved }: { product: OnboardingProduct | null; onClose: () => void; onSaved: () => void }) {
  const t = useT("rexBuild");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName(product?.name ?? "");
    setPrice(product?.price ? String(Math.round(product.price)) : "");
    setError(null);
  }, [product]);

  async function save() {
    const amount = Number(price.replace(/\D/g, ""));
    if (!name.trim()) return setError(t("item.needName"));
    if (!amount) return setError(t("item.needPrice"));
    setBusy(true);
    try {
      await updateProduct(product!.id, { name, price: amount });
      onSaved();
      onClose();
    } catch (cause) {
      setError(errorText(cause, t("error.save")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(product)} onClose={onClose} title={t("item.title")}>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {product?.image ? <img src={product.image} alt="" className="h-24 w-24 rounded-[16px] object-cover" /> : null}
        <div>
          <FieldLabel htmlFor="rex-item-name">{t("item.name")}</FieldLabel>
          <TextInput id="rex-item-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </div>
        <div>
          <FieldLabel htmlFor="rex-item-price">{t("item.price")}</FieldLabel>
          <TextInput id="rex-item-price" value={price} inputMode="numeric" onChange={(event) => setPrice(event.target.value.replace(/\D/g, ""))} />
        </div>
        {error ? <Notice>{error}</Notice> : null}
        <PillButton type="submit" tone="orange" busy={busy}>{t("item.save")}</PillButton>
      </form>
    </Dialog>
  );
}

/**
 * D1a "First, your products." Upload photos (or drag them in), take one with the phone's camera, or find stock; Rex
 * writes each one from its photo. The website's "Add to my shop" product goes in first, tagged "Added from Trending".
 */
export function ProductsStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const [writing, setWriting] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<OnboardingProduct | null>(null);
  const [dragging, setDragging] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const products = ctx.data.products ?? [];
  const intent = ctx.flow.intent;
  const reload = ctx.reload;
  const adding = useRef(false);

  // Came from the website's "Add to my shop": that product goes in first, tagged "Added from Trending".
  useEffect(() => {
    if (!intent || intent.addedProductId || adding.current) return;
    adding.current = true;
    void (async () => {
      try {
        const product = await fetchMarketplaceProduct(intent.productSlug);
        const before = new Set(products.map((item) => item.id));
        await addSupplierPick(product.id, suggestedRetailPrice(product.wholesalePrice) || product.wholesalePrice);
        const fresh = await reload();
        const added = fresh?.products?.find((item) => item.supplier && !before.has(item.id)) ?? null;
        await ctx.save({ intent: { ...intent, addedProductId: added?.id ?? "added" } });
      } catch {
        // The product isn't open to add any more: carry on without it.
        await ctx.save({ intent: { ...intent, addedProductId: "skipped" } });
      }
    })();
    // Once, when the screen opens with an intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.productSlug]);

  // Back from Find stock (another tab, or Back): the products added there show here.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  async function add(files: File[]) {
    setNote(null);
    const photos = files.filter((file) => file.type.startsWith("image/")).slice(0, PHOTOS_AT_ONCE);
    if (!photos.length) return;
    setWriting(photos.length);
    try {
      const made = await draftProducts(photos);
      const drafts = made.drafts.map((draft, index) => ({ ...draft, name: draft.name.trim() || t("products.untitled", { number: products.length + index + 1 }) }));
      await createProducts(drafts);
      if (!made.drafted) setNote(t("products.noAi"));
      else if (made.error) setNote(t("products.partly", { reason: made.error }));
      await reload();
    } catch (cause) {
      ctx.setError(errorText(cause, t("error.save")));
    } finally {
      setWriting(0);
    }
  }

  const pick = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = "";
    input.click();
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void add(Array.from(event.dataTransfer.files ?? []));
  };

  return (
    <RexFrame
      {...ctx.frame}
      close
      wide
      primary={{ title: t("products.mine"), disabled: !products.length || writing > 0, onPress: () => void ctx.next(), testId: "products-mine" }}
      link={{ title: t("products.later"), onPress: () => ctx.rexChose(t("products.later"), {}), testId: "products-later" }}
    >
      <RexSays title={t("products.title")} sub={products.length ? t("products.subHave", { count: products.length }) : t("products.sub")} />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx("grid grid-cols-3 gap-2.5 rounded-[24px] p-1 transition sm:grid-cols-4 lg:grid-cols-6", dragging && "bg-app-mint ring-2 ring-app-forest")}
      >
        {products.map((product) => (
          <ProductTile
            key={product.id}
            image={product.image}
            name={product.name}
            ok={Boolean(product.price)}
            tag={intent?.addedProductId === product.id ? t("products.trending") : null}
            note={product.price ? null : t("products.noPrice")}
            onPress={() => setEditing(product)}
          />
        ))}
        {Array.from({ length: writing }, (_, index) => (
          <span key={`writing-${index}`} className="flex aspect-[1/0.84] flex-col items-center justify-center gap-1.5 rounded-[18px] bg-app-canvas text-app-accent">
            <Spinner />
            <span className="text-[12px] text-app-ink-soft">{t("products.writing")}</span>
          </span>
        ))}
        <button type="button" onClick={() => pick(gallery.current)} aria-label={t("products.addMore")} className="flex aspect-[1/0.84] flex-col items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed border-app-line-strong text-app-ink-soft hover:bg-white">
          <Icon name="upload" size={24} />
          <span className="text-[14px] font-semibold">{t("products.addMore")}</span>
        </button>
      </div>
      <p className="m-0 text-[14px] text-app-ink-soft">{t("products.drop")}</p>
      <div className="flex flex-wrap gap-2.5">
        <SourceButton testId="products-upload" icon="upload" label={t("products.upload")} onPress={() => pick(gallery.current)} />
        {/* On a phone browser this opens the camera; on a computer it's another file picker. */}
        <SourceButton testId="products-camera" icon="image" label={t("products.takePhoto")} onPress={() => pick(camera.current)} />
        <a href="/marketplace" target="_blank" rel="noopener noreferrer" data-testid="products-find" className="inline-flex min-h-[48px] items-center gap-2 rounded-full border-[1.5px] border-app-line bg-white px-4 text-[15px] font-bold text-app-ink no-underline hover:border-app-line-strong">
          <Icon name="box" size={18} />
          {t("products.find")}
        </a>
      </div>
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void add(Array.from(event.target.files ?? []))} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void add(Array.from(event.target.files ?? []))} />
      {note ? <Notice tone="info">{note}</Notice> : null}
      <ProductDialog product={editing ? products.find((product) => product.id === editing.id) ?? editing : null} onClose={() => setEditing(null)} onSaved={() => void reload()} />
    </RexFrame>
  );
}

/** D1b "I sorted them into 3 categories. Look right?" Rename, add a category, check prices, confirm. */
export function CategoriesStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const products = ctx.data.products ?? [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const start = ctx.data.collections?.filter((collection) => collection.productIds.length).length ? ctx.data.collections! : ctx.data.suggestedGroups ?? [];
  const [groups, setGroups] = useState(() => start.map((group) => ({ name: group.name === "More products" ? t("categories.newName") : group.name, productIds: group.productIds })));
  const [renaming, setRenaming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<OnboardingProduct | null>(null);
  const checks = (ctx.data.priceChecks ?? []).map((id) => byId.get(id)).filter((product): product is OnboardingProduct => Boolean(product));

  async function confirm() {
    const kept = groups.filter((group) => group.name.trim());
    setBusy(true);
    ctx.setError(null);
    try {
      if (kept.length) await saveCategories(kept);
      await ctx.next({ categoriesConfirmed: true });
    } catch (cause) {
      ctx.setError(errorText(cause, t("error.save")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} close primary={{ title: t("categories.yes"), busy, onPress: () => void confirm(), testId: "categories-yes" }}>
      {products.length ? <RexSays title={groups.length === 1 ? t("categories.titleOne") : t("categories.title", { count: groups.length })} sub={t("categories.sub")} /> : <RexSays title={t("categories.none")} />}
      {groups.map((group, index) => {
        const thumbs = group.productIds.map((id) => byId.get(id)?.image).filter((url): url is string => Boolean(url)).slice(0, 2);
        return (
          <div key={index} className="flex items-center gap-3.5 rounded-[22px] border border-app-line bg-white p-3">
            <span className="flex h-[52px] w-[66px] shrink-0 overflow-hidden rounded-[12px] bg-app-canvas">
              {thumbs.map((url) => (
                <img key={url} src={url} alt="" className="h-full min-w-0 flex-1 object-cover" />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              {renaming === index ? (
                <input
                  autoFocus
                  value={group.name}
                  aria-label={t("categories.rename")}
                  onChange={(event) => setGroups((current) => current.map((item, at) => (at === index ? { ...item, name: event.target.value.slice(0, 80) } : item)))}
                  onBlur={() => setRenaming(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setRenaming(null);
                  }}
                  className="w-full border-0 border-b-2 border-app-accent bg-transparent py-1 text-[17px] font-extrabold text-app-ink outline-none"
                />
              ) : (
                <button type="button" aria-label={`${t("categories.rename")}: ${group.name}`} onClick={() => setRenaming(index)} className="block max-w-full truncate text-left text-[17px] font-extrabold hover:underline">
                  {group.name}
                </button>
              )}
              <span className="block text-[14px] text-app-ink-soft">{t("categories.count", { count: group.productIds.length })}</span>
            </span>
            {group.productIds.length ? (
              <button type="button" aria-label={t("categories.rename")} onClick={() => setRenaming(index)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas">
                <Icon name="edit" size={20} />
              </button>
            ) : (
              <button type="button" aria-label={t("categories.remove")} onClick={() => setGroups((current) => current.filter((_, at) => at !== index))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas">
                <Icon name="x" size={20} />
              </button>
            )}
          </div>
        );
      })}
      {products.length ? (
        <button
          type="button"
          data-testid="categories-add"
          onClick={() => {
            setGroups((current) => [...current, { name: t("categories.newName"), productIds: [] }]);
            setRenaming(groups.length);
          }}
          className="inline-flex min-h-[48px] items-center gap-2 self-start rounded-full border-[1.5px] border-app-line bg-white px-4 text-[15px] font-bold hover:border-app-line-strong"
        >
          <Icon name="plus" size={18} />
          {t("categories.add")}
        </button>
      ) : null}
      {products.length ? (
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-app-peach p-3.5 text-app-accent-ink">
          <div className="flex gap-2.5">
            <Icon name="sparkle" size={16} className="mt-1 shrink-0" />
            <p className="m-0 flex-1 text-[15px] leading-[1.4]">{checks.length ? t("categories.checkPrices", { count: checks.length }) : t("categories.checked")}</p>
          </div>
          {checks.length ? (
            <div className="flex flex-wrap gap-2">
              {checks.map((product) => (
                <PillButton key={product.id} size="sm" tone="white" onClick={() => setEditing(product)}>{product.name}</PillButton>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <ProductDialog product={editing} onClose={() => setEditing(null)} onSaved={() => void ctx.reload()} />
    </RexFrame>
  );
}
