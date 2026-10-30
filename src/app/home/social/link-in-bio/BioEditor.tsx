"use client";

import { useMemo, useState } from "react";
import { confirmDialog } from "@/components/ui/dialogs";
import { FieldLabel, Notice, PillButton, TextInput, Toggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { MediaPicker } from "@/components/media/MediaPicker";
import { QrCode } from "@/components/payment-links/QrCode";
import { BioPageView, type BioColours } from "@/app/s/[slug]/links/BioPageView";
import {
  BIO_PRESETS,
  BIO_PRESET_KEYS,
  MAX_BIO_BLOCKS,
  SOCIAL_KEYS,
  SOCIAL_LABEL,
  BIO_BLOCK_DEFAULT_LABEL,
  bioBlockLabel,
  bioBlockProblems,
  bioColours,
  newBlockId,
  newestProducts,
  socialUrl,
  starterBlocks,
  whatsappChatUrl,
  type BioBlock,
  type BioBlockType,
  type BioPreset,
  type BioProblemField,
  type BioTheme,
} from "@/lib/bio/pure";
import type { PublicBioBlock, PublicBioPage, SellerBioPage } from "@/lib/bio/service.server";

// The link in bio editor: the page's link with Instagram and TikTok tips and a QR code, the profile (photo, name,
// line), the look, and the blocks (add, reorder, remove), with taps per block and a live phone preview.

interface PickProduct {
  id: string;
  name: string;
  image: string | null;
  price: number;
  /** When it was added (ISO), for the "New arrivals" preview. */
  createdAt: string;
}

const BLOCK_ICON: Record<BioBlockType, IconName> = { product: "bag", collection: "grid", link: "link", socials: "instagram", whatsapp: "whatsapp", signup: "mail", text: "edit", shop: "shop", arrivals: "sparkle", track: "truck" };
const ADDABLE: BioBlockType[] = ["shop", "arrivals", "product", "whatsapp", "track", "socials", "link", "collection", "signup", "text"];
/** Blocks that need products in the shop before they can be added. */
const NEEDS_PRODUCTS = new Set<BioBlockType>(["product", "shop", "arrivals"]);

/** The id suffix of each field's input in BlockFields (blk-<block id>-<suffix>), to focus the first one to fix. */
const FIELD_INPUT: Partial<Record<BioProblemField, string>> = { label: "l", url: "u", phone: "ph", text: "x", productId: "p", collectionId: "c" };

/** What needs fixing, per block id then field, in the seller's language. */
type ProblemMap = Map<string, Map<BioProblemField, string>>;

function focusField(blockId: string, field: BioProblemField) {
  window.requestAnimationFrame(() => {
    const suffix = FIELD_INPUT[field];
    const target = (suffix && document.getElementById(`blk-${blockId}-${suffix}`)) || document.getElementById(`blk-${blockId}`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
  });
}

function blankBlock(type: BioBlockType, products: PickProduct[], collections: Array<{ id: string }>, whatsapp: string): BioBlock | null {
  const id = newBlockId();
  switch (type) {
    case "product":
      return products[0] ? { id, type, productId: products[0].id, action: "page", featured: false } : null;
    case "collection":
      return collections[0] ? { id, type, collectionId: collections[0].id } : null;
    case "link":
      return { id, type, label: "", url: "" };
    case "socials":
      return { id, type, links: {} };
    case "whatsapp":
      return { id, type, phone: whatsapp, label: "" };
    case "signup":
      return { id, type, title: "", buttonLabel: "" };
    case "text":
      return { id, type, text: "" };
    case "shop":
    case "arrivals":
    case "track":
      return { id, type };
  }
}

export function BioEditor({
  slug,
  currency,
  initial,
  products,
  collections,
  whatsapp,
  storeColours,
  storeLogo,
  storeLive,
}: {
  slug: string;
  currency: string;
  initial: SellerBioPage;
  products: PickProduct[];
  collections: Array<{ id: string; name: string }>;
  whatsapp: string;
  storeColours: BioColours;
  /** The store's logo and its brandSettings.logoVariants, so the preview draws it as the page will. */
  storeLogo: { logoUrl: string | null; logoVariants: unknown };
  /** Whether the shop is live (the page opens only then). */
  storeLive: boolean;
}) {
  const t = useT("paylinks");
  const [published, setPublished] = useState(initial.published);
  const [title, setTitle] = useState(initial.title);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [theme, setTheme] = useState<BioTheme>(initial.theme);
  const [blocks, setBlocks] = useState<BioBlock[]>(initial.blocks);
  const [clicks, setClicks] = useState(initial.clicks);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string; blockId?: string; field?: BioProblemField } | null>(null);
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState({ exists: initial.exists, published: initial.published });
  const [copied, setCopied] = useState(false);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const collectionById = useMemo(() => new Map(collections.map((collection) => [collection.id, collection])), [collections]);

  // The same checks the server makes (bioBlockProblems), shown once the seller has tried to save and kept up to
  // date as they fix each field.
  const problems = useMemo(() => bioBlockProblems(blocks, { productIds: products.map((product) => product.id), collectionIds: collections.map((collection) => collection.id) }), [blocks, products, collections]);
  const problemText = (field: BioProblemField) => {
    switch (field) {
      case "label":
        return t("fix.label");
      case "url":
        return t("fix.url");
      case "phone":
        return t("fix.phone");
      case "text":
        return t("fix.text");
      case "productId":
        return t("fix.productId");
      case "collectionId":
        return t("fix.collectionId");
      default:
        return t("fix.other");
    }
  };
  const problemMap: ProblemMap = new Map();
  const mark = (blockId: string, field: BioProblemField, text: string) => {
    const fields = problemMap.get(blockId) ?? new Map<BioProblemField, string>();
    if (!fields.has(field)) fields.set(field, text);
    problemMap.set(blockId, fields);
  };
  if (checked) for (const problem of problems) mark(problem.blockId, problem.field, problemText(problem.field));
  if (notice?.tone === "error" && notice.blockId && notice.field) mark(notice.blockId, notice.field, problemText(notice.field));

  const touch = () => {
    setDirty(true);
    setNotice(null);
  };
  const updateBlock = (index: number, next: BioBlock) => {
    setBlocks((prev) => prev.map((block, i) => (i === index ? next : block)));
    touch();
  };
  const move = (index: number, by: number) => {
    setBlocks((prev) => {
      const target = index + by;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
    touch();
  };
  async function remove(index: number) {
    if (!(await confirmDialog({ title: t("bio.removeTitle"), message: t("bio.removeMessage"), confirmLabel: t("bio.remove"), tone: "danger" }))) return;
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    touch();
  }
  function add(type: BioBlockType) {
    const block = blankBlock(type, products, collections, whatsapp);
    if (!block || blocks.length >= MAX_BIO_BLOCKS) return;
    setBlocks((prev) => [...prev, block]);
    touch();
  }
  function addWebsite() {
    if (blocks.length >= MAX_BIO_BLOCKS) return;
    setBlocks((prev) => [...prev, { id: newBlockId(), type: "link", label: t("bio.websiteLabel"), url: initial.storeUrl }]);
    touch();
  }
  function fill() {
    setBlocks(starterBlocks({ productIds: products.slice(0, 5).map((product) => product.id), whatsapp, buyNow: true, shopButtons: true }));
    touch();
  }

  async function save() {
    setNotice(null);
    // Nothing goes to the server while a block is missing something: mark each field and go to the first one.
    if (problems.length) {
      setChecked(true);
      focusField(problems[0].blockId, problems[0].field);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/app/bio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published, title: title.trim() || null, bio: bio.trim() || null, avatarUrl: avatarUrl.trim() || "", theme, blocks }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        // A refusal about one block (error.blockIndex) marks that block's field too.
        const index = typeof json?.error?.blockIndex === "number" ? json.error.blockIndex : -1;
        const block = index >= 0 ? blocks[index] : undefined;
        const field = typeof json?.error?.field === "string" ? (json.error.field as BioProblemField) : "other";
        setNotice({ tone: "error", text: json?.error?.message ?? t("bio.saveFailed"), blockId: block?.id, field: block ? field : undefined });
        if (block) focusField(block.id, field);
        return;
      }
      const page = json.data as SellerBioPage;
      setBlocks(page.blocks);
      setClicks(page.clicks);
      setSaved({ exists: page.exists, published: page.published });
      setChecked(false);
      setDirty(false);
      setNotice({ tone: "success", text: t("bio.saved") });
    } catch {
      setNotice({ tone: "error", text: t("bio.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(initial.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  const colours = bioColours(theme, storeColours);
  const preview: PublicBioPage = {
    title: title.trim() || "—",
    bio,
    avatarUrl: avatarUrl || null,
    theme,
    currency,
    storeLogo,
    blocks: blocks.flatMap((block): PublicBioBlock[] => {
      if (block.type === "product") {
        const product = productById.get(block.productId);
        return product ? [{ id: block.id, type: "product", name: block.label || product.name, price: product.price, image: product.image, href: "#", featured: block.featured, cta: block.action === "pay" ? "Buy now" : "View" }] : [];
      }
      if (block.type === "collection") {
        const collection = collectionById.get(block.collectionId);
        return collection ? [{ id: block.id, type: "link", label: block.label || collection.name, href: "#" }] : [];
      }
      if (block.type === "link") return block.label ? [{ id: block.id, type: "link", label: block.label, href: "#" }] : [];
      if (block.type === "socials") {
        const links = SOCIAL_KEYS.flatMap((key) => (socialUrl(key, block.links[key]) ? [{ key, label: SOCIAL_LABEL[key], href: "#" }] : []));
        return links.length ? [{ id: block.id, type: "socials", links }] : [];
      }
      if (block.type === "whatsapp") return [{ id: block.id, type: "whatsapp", label: block.label || "Chat on WhatsApp", href: whatsappChatUrl(block.phone) }];
      if (block.type === "signup") return [{ id: block.id, type: "signup", title: block.title || "Get our news and offers", buttonLabel: block.buttonLabel || "Sign up" }];
      if (block.type === "shop") return [{ id: block.id, type: "shop", label: bioBlockLabel(block), href: "#" }];
      if (block.type === "arrivals") {
        const newest = newestProducts(products).map((product) => ({ id: product.id, name: product.name, price: product.price, image: product.image, href: "#" }));
        return newest.length ? [{ id: block.id, type: "arrivals", label: bioBlockLabel(block), products: newest }] : [];
      }
      if (block.type === "track") return [{ id: block.id, type: "track", label: bioBlockLabel(block), orderHref: "#" }];
      return block.text ? [{ id: block.id, type: "text", text: block.text }] : [];
    }),
  };

  const card = "rounded-[22px] border border-app-line bg-white p-4 sm:p-5";
  const totalTaps = Object.values(clicks).reduce((sum, count) => sum + count, 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-4">
        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("bio.yourLink")}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 basis-[220px] truncate rounded-[12px] bg-app-canvas px-3 py-2.5 text-[13px]">{initial.url}</code>
            <PillButton size="sm" tone="ink" onClick={() => void copy()}>
              <Icon name={copied ? "check" : "copy"} size={14} />
              {copied ? t("bio.copied") : t("bio.copy")}
            </PillButton>
            <a href={initial.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[38px] items-center rounded-full border border-app-line px-4 text-[13px] font-bold text-app-ink no-underline">{t("bio.open")}</a>
          </div>
          <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t("bio.views", { count: initial.views })} · {t("bio.taps", { count: totalTaps })}</p>
          {!storeLive ? (
            <p className="mb-0 mt-2 text-[13.5px] font-semibold text-app-ink">{t("bio.storeNotLive")}</p>
          ) : !saved.published ? (
            <p className="mb-0 mt-2 text-[13.5px] font-semibold text-app-ink">{t("bio.offHint")}</p>
          ) : !saved.exists ? (
            <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">{t("bio.starterLive")}</p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <ul className="m-0 grid list-none gap-2 p-0 text-[14px] leading-[1.5]">
              <li className="flex gap-2"><Icon name="instagram" size={16} className="mt-0.5 shrink-0" />{t("bio.tipInstagram")}</li>
              <li className="flex gap-2"><Icon name="tiktok" size={16} className="mt-0.5 shrink-0" />{t("bio.tipTiktok")}</li>
            </ul>
            <div className="flex flex-col items-center gap-1">
              <QrCode value={initial.url} label={t("bio.qr")} size={120} />
              <span className="max-w-[160px] text-center text-[12px] text-app-ink-soft">{t("bio.qr")}</span>
            </div>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[17px] font-extrabold">{t("bio.profile")}</h2>
            <Toggle on={published} onChange={(on) => { setPublished(on); touch(); }} label={t("bio.published")} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <MediaPicker label={t("bio.photo")} value={avatarUrl} onChange={(url) => { setAvatarUrl(url); touch(); }} shape="square" compact />
            <div className="grid content-start gap-3">
              <div>
                <FieldLabel htmlFor="bio-title">{t("bio.name")}</FieldLabel>
                <TextInput id="bio-title" value={title} maxLength={80} onChange={(event) => { setTitle(event.target.value); touch(); }} />
              </div>
              <div>
                <FieldLabel htmlFor="bio-line">{t("bio.bioLine")}</FieldLabel>
                <textarea id="bio-line" value={bio} maxLength={300} rows={2} onChange={(event) => { setBio(event.target.value); touch(); }} className="w-full rounded-[14px] border border-app-line bg-white px-4 py-3 text-[15px]" />
              </div>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("bio.theme")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {BIO_PRESET_KEYS.map((key: BioPreset) => {
              const swatch = key === "store" ? storeColours : BIO_PRESETS[key];
              return (
                <button key={key} type="button" aria-pressed={theme.preset === key} onClick={() => { setTheme({ preset: key }); touch(); }} className={cx("flex min-h-11 items-center gap-2 rounded-full border px-3 text-[13.5px] font-bold", theme.preset === key ? "border-app-ink" : "border-app-line")}>
                  <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: swatch.background }} />
                  <span className="h-5 w-5 -ml-3 rounded-full border border-black/10" style={{ background: swatch.button }} />
                  {key === "store" ? t("bio.colours") : BIO_PRESETS[key].label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["background", "text", "button", "buttonText"] as const).map((key) => (
              <label key={key} className="grid gap-1 text-[13px] font-bold">
                {t(key === "background" ? "bio.background" : key === "text" ? "bio.text" : key === "button" ? "bio.buttonColour" : "bio.buttonText")}
                <input type="color" value={colours[key] || "#000000"} onChange={(event) => { setTheme((prev) => ({ ...prev, [key]: event.target.value })); touch(); }} className="h-11 w-full cursor-pointer rounded-[12px] border border-app-line bg-white" />
              </label>
            ))}
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[17px] font-extrabold">{t("bio.blocks")}</h2>
            {products.length ? (
              <PillButton size="sm" tone="white" onClick={fill} title={t("bio.starterHint")}>
                <Icon name="sparkle" size={14} />
                {t("bio.starter")}
              </PillButton>
            ) : null}
          </div>
          {blocks.length === 0 ? <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("bio.noBlocks")}</p> : null}
          <ol className="m-0 mt-3 grid list-none gap-3 p-0">
            {blocks.map((block, index) => (
              <li key={block.id} id={`blk-${block.id}`} tabIndex={-1} className={cx("rounded-[16px] border p-3 outline-none", problemMap.has(block.id) ? "border-app-danger" : "border-app-line")}>
                <div className="flex items-center gap-2">
                  <Icon name={BLOCK_ICON[block.type]} size={16} />
                  <span className="min-w-0 flex-1 text-[14px] font-extrabold">{t(`block.${block.type}`)}</span>
                  <span className="text-[12.5px] text-app-ink-soft">{t("bio.taps", { count: clicks[block.id] ?? 0 })}</span>
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("bio.up")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30"><Icon name="arrowUp" size={15} /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label={t("bio.down")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30"><Icon name="arrowDown" size={15} /></button>
                  <button type="button" onClick={() => void remove(index)} aria-label={t("bio.remove")} className="grid h-10 w-10 place-items-center rounded-full text-app-danger hover:bg-app-canvas"><Icon name="trash" size={15} /></button>
                </div>
                <BlockFields block={block} products={products} collections={collections} problems={problemMap.get(block.id)} onChange={(next) => updateBlock(index, next)} />
                {problemMap.get(block.id)?.get("other") ? <p className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{problemMap.get(block.id)!.get("other")}</p> : null}
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <p className="mb-2 mt-0 text-[13px] font-bold text-app-ink-soft">{t("bio.addBlock")}</p>
            <div className="flex flex-wrap gap-2">
              {/* The shop's own address as a link, and a new product (made on the products page, then added here). */}
              <button type="button" onClick={() => addWebsite()} disabled={blocks.length >= MAX_BIO_BLOCKS} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold disabled:opacity-40">
                <Icon name="shop" size={14} />
                {t("bio.addWebsite")}
              </button>
              <a href="/products/new" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold text-app-ink no-underline">
                <Icon name="plus" size={14} />
                {t("bio.addNewProduct")}
              </a>
              {ADDABLE.map((type) => (
                <button key={type} type="button" onClick={() => add(type)} disabled={blocks.length >= MAX_BIO_BLOCKS || (NEEDS_PRODUCTS.has(type) && !products.length) || (type === "collection" && !collections.length)} title={NEEDS_PRODUCTS.has(type) && !products.length ? t("block.noProducts") : type === "collection" && !collections.length ? t("block.noCollections") : undefined} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold disabled:opacity-40">
                  <Icon name={BLOCK_ICON[type]} size={14} />
                  {t(`block.${type}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className={cx("sticky bottom-3 z-10 grid gap-3 rounded-[18px] border bg-white/95 p-3 shadow-sm backdrop-blur", (checked && problems.length) || notice?.tone === "error" ? "border-app-danger" : "border-app-line")}>
          {checked && problems.length ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-semibold text-app-danger">
              <span className="flex min-w-0 items-center gap-2"><Icon name="info" size={16} className="shrink-0" />{t("fix.alert", { count: problems.length })}</span>
              <button type="button" onClick={() => focusField(problems[0].blockId, problems[0].field)} className="min-h-10 rounded-full border border-app-danger bg-white px-3.5 text-[13px] font-bold text-app-danger">{t("fix.showFirst")}</button>
            </div>
          ) : notice ? (
            <Notice tone={notice.tone}>{notice.text}</Notice>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13.5px] text-app-ink-soft">{dirty ? t("bio.unsaved") : ""}</span>
            <PillButton size="md" tone="ink" busy={saving} onClick={() => void save()}>{t("bio.save")}</PillButton>
          </div>
        </div>
      </div>

      <aside className="min-w-0">
        <div className="xl:sticky xl:top-4">
          <p className="mb-2 mt-0 text-[13px] font-bold text-app-ink-soft">{t("bio.preview")}</p>
          <div className="mx-auto h-[640px] w-full max-w-[340px] overflow-hidden rounded-[36px] border-[8px] border-app-ink bg-app-ink">
            <div className="h-full overflow-y-auto rounded-[28px]" style={{ background: colours.background }}>
              <BioPageView slug={slug} page={preview} colours={colours} preview showFooter={false} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function BlockFields({ block, products, collections, problems, onChange }: { block: BioBlock; products: PickProduct[]; collections: Array<{ id: string; name: string }>; problems?: Map<BioProblemField, string>; onChange: (next: BioBlock) => void }) {
  const t = useT("paylinks");
  const select = "h-12 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px]";
  const id = `blk-${block.id}`;
  // A field that needs fixing: red border, aria-invalid, and what to add right under it.
  const invalid = (field: BioProblemField, inputId: string) =>
    problems?.has(field) ? ({ "aria-invalid": true as const, "aria-describedby": `${inputId}-err`, className: "!border-app-danger" } as const) : {};
  const problem = (field: BioProblemField, inputId: string) =>
    problems?.has(field) ? <p id={`${inputId}-err`} className="mb-0 mt-1.5 text-[13px] font-semibold text-app-danger">{problems.get(field)}</p> : null;
  if (block.type === "product") {
    const known = products.some((product) => product.id === block.productId);
    return (
      <div className="mt-3 grid gap-3">
        <div>
          <FieldLabel htmlFor={`${id}-p`}>{t("block.pickProduct")}</FieldLabel>
          <select id={`${id}-p`} value={known ? block.productId : ""} onChange={(event) => onChange({ ...block, productId: event.target.value, payCode: undefined })} {...invalid("productId", `${id}-p`)} className={cx(select, problems?.has("productId") && "!border-app-danger")}>
            {known ? null : <option value="">{t("block.pickProduct")}</option>}
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          {problem("productId", `${id}-p`)}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["page", "pay"] as const).map((action) => (
            <button key={action} type="button" aria-pressed={block.action === action} onClick={() => onChange({ ...block, action })} className={cx("min-h-11 rounded-full border px-3.5 text-[13.5px] font-bold", block.action === action ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
              {action === "pay" ? t("block.buyNow") : t("block.openPage")}
            </button>
          ))}
        </div>
        <Toggle on={block.featured} onChange={(featured) => onChange({ ...block, featured })} label={t("block.featured")} />
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.label")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} {...invalid("label", `${id}-l`)} />
          {problem("label", `${id}-l`)}
        </div>
      </div>
    );
  }
  if (block.type === "collection") {
    const known = collections.some((collection) => collection.id === block.collectionId);
    return (
      <div className="mt-3 grid gap-3">
        <div>
          <FieldLabel htmlFor={`${id}-c`}>{t("block.pickCollection")}</FieldLabel>
          <select id={`${id}-c`} value={known ? block.collectionId : ""} onChange={(event) => onChange({ ...block, collectionId: event.target.value })} {...invalid("collectionId", `${id}-c`)} className={cx(select, problems?.has("collectionId") && "!border-app-danger")}>
            {known ? null : <option value="">{t("block.pickCollection")}</option>}
            {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
          {problem("collectionId", `${id}-c`)}
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.label")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} {...invalid("label", `${id}-l`)} />
          {problem("label", `${id}-l`)}
        </div>
      </div>
    );
  }
  if (block.type === "link") {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.linkLabel")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} {...invalid("label", `${id}-l`)} />
          {problem("label", `${id}-l`)}
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-u`}>{t("block.url")}</FieldLabel>
          <TextInput id={`${id}-u`} type="url" inputMode="url" placeholder="https://" value={block.url} maxLength={500} onChange={(event) => onChange({ ...block, url: event.target.value })} {...invalid("url", `${id}-u`)} />
          {problem("url", `${id}-u`)}
        </div>
      </div>
    );
  }
  if (block.type === "socials") {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <p className="m-0 text-[13px] text-app-ink-soft sm:col-span-2">{t("block.socialHint")}</p>
        {SOCIAL_KEYS.map((key) => (
          <div key={key}>
            <FieldLabel htmlFor={`${id}-${key}`}>{SOCIAL_LABEL[key]}</FieldLabel>
            <TextInput id={`${id}-${key}`} value={block.links[key] ?? ""} maxLength={200} onChange={(event) => onChange({ ...block, links: { ...block.links, [key]: event.target.value } })} />
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "whatsapp") {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-ph`}>{t("block.phone")}</FieldLabel>
          <TextInput id={`${id}-ph`} type="tel" placeholder="+2348012345678" value={block.phone} maxLength={20} onChange={(event) => onChange({ ...block, phone: event.target.value })} {...invalid("phone", `${id}-ph`)} />
          {problem("phone", `${id}-ph`)}
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.label")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} {...invalid("label", `${id}-l`)} />
          {problem("label", `${id}-l`)}
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor={`${id}-m`}>{t("block.message")}</FieldLabel>
          <TextInput id={`${id}-m`} value={block.message ?? ""} maxLength={300} onChange={(event) => onChange({ ...block, message: event.target.value })} />
        </div>
      </div>
    );
  }
  if (block.type === "signup") {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-t`}>{t("block.signupTitle")}</FieldLabel>
          <TextInput id={`${id}-t`} value={block.title ?? ""} maxLength={120} onChange={(event) => onChange({ ...block, title: event.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-b`}>{t("block.signupButton")}</FieldLabel>
          <TextInput id={`${id}-b`} value={block.buttonLabel ?? ""} maxLength={40} onChange={(event) => onChange({ ...block, buttonLabel: event.target.value })} />
        </div>
      </div>
    );
  }
  if (block.type === "shop" || block.type === "arrivals" || block.type === "track") {
    return (
      <div className="mt-3 grid gap-2">
        <p className="m-0 text-[13px] text-app-ink-soft">{t(`block.${block.type}Hint`)}</p>
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.label")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={40} placeholder={BIO_BLOCK_DEFAULT_LABEL[block.type]} onChange={(event) => onChange({ ...block, label: event.target.value })} {...invalid("label", `${id}-l`)} />
          {problem("label", `${id}-l`)}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <FieldLabel htmlFor={`${id}-x`}>{t("block.textBody")}</FieldLabel>
      <textarea id={`${id}-x`} value={block.text} maxLength={500} rows={2} onChange={(event) => onChange({ ...block, text: event.target.value })} {...invalid("text", `${id}-x`)} className={cx("w-full rounded-[14px] border border-app-line bg-white px-4 py-3 text-[15px]", problems?.has("text") && "!border-app-danger")} />
      {problem("text", `${id}-x`)}
    </div>
  );
}
