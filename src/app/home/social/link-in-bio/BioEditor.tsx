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
  bioColours,
  newBlockId,
  socialUrl,
  starterBlocks,
  whatsappChatUrl,
  type BioBlock,
  type BioBlockType,
  type BioPreset,
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
}

const BLOCK_ICON: Record<BioBlockType, IconName> = { product: "bag", collection: "grid", link: "link", socials: "instagram", whatsapp: "whatsapp", signup: "mail", text: "edit" };
const ADDABLE: BioBlockType[] = ["product", "whatsapp", "socials", "link", "collection", "signup", "text"];

function blankBlock(type: BioBlockType, products: PickProduct[], collections: Array<{ id: string }>, whatsapp: string): BioBlock | null {
  const id = newBlockId();
  switch (type) {
    case "product":
      return products[0] ? { id, type, productId: products[0].id, action: "page", featured: false } : null;
    case "collection":
      return collections[0] ? { id, type, collectionId: collections[0].id } : null;
    case "link":
      return { id, type, label: "", url: "https://" };
    case "socials":
      return { id, type, links: {} };
    case "whatsapp":
      return { id, type, phone: whatsapp || "+234", label: "" };
    case "signup":
      return { id, type, title: "", buttonLabel: "" };
    case "text":
      return { id, type, text: "" };
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
}: {
  slug: string;
  currency: string;
  initial: SellerBioPage;
  products: PickProduct[];
  collections: Array<{ id: string; name: string }>;
  whatsapp: string;
  storeColours: BioColours;
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
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const collectionById = useMemo(() => new Map(collections.map((collection) => [collection.id, collection])), [collections]);

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
  function fill() {
    setBlocks(starterBlocks({ productIds: products.slice(0, 5).map((product) => product.id), whatsapp, buyNow: true }));
    touch();
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/app/bio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published, title: title.trim() || null, bio: bio.trim() || null, avatarUrl: avatarUrl.trim() || "", theme, blocks }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice({ tone: "error", text: json?.error?.message ?? t("bio.saveFailed") });
        return;
      }
      const page = json.data as SellerBioPage;
      setBlocks(page.blocks);
      setClicks(page.clicks);
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
              <li key={block.id} className="rounded-[16px] border border-app-line p-3">
                <div className="flex items-center gap-2">
                  <Icon name={BLOCK_ICON[block.type]} size={16} />
                  <span className="min-w-0 flex-1 text-[14px] font-extrabold">{t(`block.${block.type}`)}</span>
                  <span className="text-[12.5px] text-app-ink-soft">{t("bio.taps", { count: clicks[block.id] ?? 0 })}</span>
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("bio.up")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30"><Icon name="arrowUp" size={15} /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label={t("bio.down")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30"><Icon name="arrowDown" size={15} /></button>
                  <button type="button" onClick={() => void remove(index)} aria-label={t("bio.remove")} className="grid h-10 w-10 place-items-center rounded-full text-app-danger hover:bg-app-canvas"><Icon name="trash" size={15} /></button>
                </div>
                <BlockFields block={block} products={products} collections={collections} onChange={(next) => updateBlock(index, next)} />
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <p className="mb-2 mt-0 text-[13px] font-bold text-app-ink-soft">{t("bio.addBlock")}</p>
            <div className="flex flex-wrap gap-2">
              {ADDABLE.map((type) => (
                <button key={type} type="button" onClick={() => add(type)} disabled={blocks.length >= MAX_BIO_BLOCKS || (type === "product" && !products.length) || (type === "collection" && !collections.length)} title={type === "product" && !products.length ? t("block.noProducts") : type === "collection" && !collections.length ? t("block.noCollections") : undefined} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold disabled:opacity-40">
                  <Icon name={BLOCK_ICON[type]} size={14} />
                  {t(`block.${type}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-app-line bg-white/95 p-3 shadow-sm backdrop-blur">
          <span className="text-[13.5px] text-app-ink-soft">{dirty ? t("bio.unsaved") : ""}</span>
          <PillButton size="md" tone="ink" busy={saving} onClick={() => void save()}>{t("bio.save")}</PillButton>
        </div>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
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

function BlockFields({ block, products, collections, onChange }: { block: BioBlock; products: PickProduct[]; collections: Array<{ id: string; name: string }>; onChange: (next: BioBlock) => void }) {
  const t = useT("paylinks");
  const select = "h-12 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px]";
  const id = `blk-${block.id}`;
  if (block.type === "product") {
    return (
      <div className="mt-3 grid gap-3">
        <div>
          <FieldLabel htmlFor={`${id}-p`}>{t("block.pickProduct")}</FieldLabel>
          <select id={`${id}-p`} value={block.productId} onChange={(event) => onChange({ ...block, productId: event.target.value, payCode: undefined })} className={select}>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
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
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} />
        </div>
      </div>
    );
  }
  if (block.type === "collection") {
    return (
      <div className="mt-3 grid gap-3">
        <div>
          <FieldLabel htmlFor={`${id}-c`}>{t("block.pickCollection")}</FieldLabel>
          <select id={`${id}-c`} value={block.collectionId} onChange={(event) => onChange({ ...block, collectionId: event.target.value })} className={select}>
            {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.label")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} />
        </div>
      </div>
    );
  }
  if (block.type === "link") {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.linkLabel")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-u`}>{t("block.url")}</FieldLabel>
          <TextInput id={`${id}-u`} type="url" value={block.url} maxLength={500} onChange={(event) => onChange({ ...block, url: event.target.value })} />
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
          <TextInput id={`${id}-ph`} type="tel" value={block.phone} maxLength={20} onChange={(event) => onChange({ ...block, phone: event.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-l`}>{t("block.label")}</FieldLabel>
          <TextInput id={`${id}-l`} value={block.label ?? ""} maxLength={80} onChange={(event) => onChange({ ...block, label: event.target.value })} />
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
  return (
    <div className="mt-3">
      <FieldLabel htmlFor={`${id}-x`}>{t("block.textBody")}</FieldLabel>
      <textarea id={`${id}-x`} value={block.text} maxLength={500} rows={2} onChange={(event) => onChange({ ...block, text: event.target.value })} className="w-full rounded-[14px] border border-app-line bg-white px-4 py-3 text-[15px]" />
    </div>
  );
}
