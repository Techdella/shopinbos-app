"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { createSnapshotFromTemplate, getTemplateManifest } from "@/lib/store-templates/catalog";
import type { StoreEditorSnapshot, TemplateCategory, TemplateGalleryItem } from "@/lib/store-templates/types";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";

const CATEGORY_OPTIONS: Array<{ id: TemplateCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "beauty", label: "Beauty" },
  { id: "fashion", label: "Fashion" },
  { id: "electronics", label: "Electronics" },
  { id: "food", label: "Food" },
  { id: "furniture", label: "Home" },
];

const TEMPLATE_ID_TO_IMAGE: Record<string, string> = {
  "shopinbos-boutique": "/brand/templates/fashion-stores-showcase.webp",
  "noir-atelier": "/brand/templates/fashion-stores-showcase.webp",
  "glow-ritual": "/brand/templates/beauty-stores-showcase.webp",
  "lumi-beauty": "/brand/templates/beauty-browser-mockup.webp",
  "terra-home": "/brand/templates/customer-stores-final.webp",
  "nova-tech": "/brand/templates/electronics-browser-mockup.webp",
  "fresh-basket": "/brand/templates/food-browser-mockup.webp",
  "chapter-house": "/brand/templates/customer-stores-final.webp",
  pawhaven: "/brand/templates/customer-stores-final.webp",
  "street-mode": "/brand/templates/fashion-stores-showcase.webp",
  "aurum-jewels": "/brand/templates/fashion-stores-showcase.webp",
  "happy-box": "/brand/templates/food-browser-mockup.webp",
  bloom: "/brand/templates/beauty-browser-mockup.webp",
  kaira: "/brand/templates/fashion-stores-showcase.webp",
  famms: "/brand/templates/fashion-stores-showcase.webp",
  stylish: "/brand/templates/beauty-stores-showcase.webp",
  hexashop: "/brand/templates/fashion-stores-showcase.webp",
  malefashion: "/brand/templates/fashion-stores-showcase.webp",
  shionhouse: "/brand/templates/beauty-stores-showcase.webp",
  footwear: "/brand/templates/fashion-stores-showcase.webp",
  foodmart: "/brand/templates/food-browser-mockup.webp",
  freshshop: "/brand/templates/food-browser-mockup.webp",
  fruitables: "/brand/templates/food-browser-mockup.webp",
  organic: "/brand/templates/food-browser-mockup.webp",
  electro: "/brand/templates/electronics-browser-mockup.webp",
  eflyer: "/brand/templates/electronics-browser-mockup.webp",
  ministore: "/brand/templates/customer-stores-final.webp",
  furnish: "/brand/templates/customer-stores-final.webp",
  furni: "/brand/templates/customer-stores-final.webp",
  "the-plaza": "/brand/templates/customer-stores-final.webp",
  booksaw: "/brand/templates/customer-stores-final.webp",
  bookly: "/brand/templates/customer-stores-final.webp",
  waggy: "/brand/templates/customer-stores-final.webp",
  ogani: "/brand/templates/customer-stores-final.webp",
  karma: "/brand/templates/customer-stores-final.webp",
  mellow: "/brand/templates/customer-stores-final.webp",
  cycle: "/brand/templates/electronics-browser-mockup.webp",
  ultras: "/brand/templates/fashion-stores-showcase.webp",
  minishop: "/brand/templates/customer-stores-final.webp",
  caraft: "/brand/templates/beauty-stores-showcase.webp",
  aj: "/brand/templates/customer-stores-final.webp",
};

function templateImage(template: TemplateGalleryItem) {
  return template.previewImage ?? TEMPLATE_ID_TO_IMAGE[template.id] ?? "/brand/templates/customer-stores-final.webp";
}

function categoryLabel(category: TemplateGalleryItem["category"]) {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? category;
}

function inferredCategory(value?: string | null): TemplateCategory | "all" {
  const text = value?.toLowerCase() ?? "";
  if (text.includes("food") || text.includes("grocer")) return "food";
  if (text.includes("fashion") || text.includes("cloth")) return "fashion";
  if (text.includes("beauty") || text.includes("skin")) return "beauty";
  if (text.includes("elect") || text.includes("tech")) return "electronics";
  if (text.includes("home") || text.includes("living")) return "furniture";
  return "all";
}

function swatches(template: TemplateGalleryItem) {
  const theme = template.themeTokens;
  return [theme.heroBg, theme.accent, theme.paperBg, theme.cardBg];
}

function MiniStorePreview({ template, large = false }: { template: TemplateGalleryItem; large?: boolean }) {
  const theme = template.themeTokens;
  const src = templateImage(template);
  const layoutFamily = template.layoutFamily;

  if (template.id === "lumi-beauty") {
    return (
      <div className="h-full w-full overflow-hidden" style={{ background: theme.paperBg }}>
        <div className="flex h-8 items-center justify-between px-4" style={{ background: theme.heroBg }}>
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-[7px]" style={{ background: theme.accent }} />
            <span className="h-2 w-12 rounded-full" style={{ background: theme.ink }} />
          </div>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((index) => <span key={index} className="h-1.5 w-8 rounded-full" style={{ background: index === 0 ? theme.accent : theme.border }} />)}
          </div>
        </div>
        <div className="grid h-[58%] grid-cols-[1.05fr_.95fr]">
          <div className="p-5" style={{ background: theme.heroBg }}>
            <div className="mb-3 h-2 w-16 rounded-full" style={{ background: theme.accent }} />
            <div className="mb-2 h-6 w-32 rounded-full" style={{ background: theme.ink }} />
            <div className="mb-2 h-6 w-24 rounded-full" style={{ background: theme.ink }} />
            <div className="mt-4 h-2 w-28 rounded-full" style={{ background: theme.muted }} />
            <div className="mt-5 h-6 w-20 rounded-[8px]" style={{ background: theme.accent }} />
          </div>
          <div className="relative overflow-hidden">
            <img src={src} alt={template.name} className="h-full w-full object-cover" />
            <div className="absolute bottom-3 left-3 rounded-[14px] bg-white px-3 py-2 shadow-lg">
              <div className="h-1.5 w-14 rounded-full" style={{ background: theme.accent }} />
              <div className="mt-1.5 h-1.5 w-20 rounded-full bg-black/15" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 overflow-hidden px-4 py-3" style={{ background: theme.accent }}>
          {[0, 1, 2, 3].map((index) => <span key={index} className="h-2 w-20 shrink-0 rounded-full bg-white/70" />)}
        </div>
        <div className="grid grid-cols-4 gap-2 p-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-12 rounded-[14px] border bg-white" style={{ borderColor: theme.border }} />)}
        </div>
      </div>
    );
  }

  if (layoutFamily === "fashion-runway" || layoutFamily === "editorial-boutique" || template.id === "velour-premium") {
    return (
      <div className="h-full w-full overflow-hidden" style={{ background: theme.paperBg }}>
        <div className="flex h-8 items-center justify-between px-4" style={{ background: theme.heroBg }}>
          <div className="h-4 w-20 rounded-[3px]" style={{ background: theme.accent }} />
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((index) => <span key={index} className="h-1.5 w-7 rounded-full bg-white/35" />)}
          </div>
        </div>
        <div className="grid h-[64%] grid-cols-2">
          <div className="p-5" style={{ background: theme.heroBg }}>
            <div className="mb-4 h-2 w-16 rounded-full" style={{ background: theme.accent }} />
            <div className="mb-2 h-7 w-32 rounded-full bg-white/95" />
            <div className="mb-2 h-7 w-24 rounded-full bg-white/85" />
            <div className="mt-5 h-7 w-20 rounded-[5px]" style={{ background: theme.accent }} />
          </div>
          <div className="grid grid-cols-2 gap-1 p-1">
            <img src={src} alt={template.name} className="col-span-1 h-full w-full object-cover" />
            <div className="grid gap-1">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <div style={{ background: theme.accent }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4">
          {[0, 1, 2].map((index) => <div key={index} className="h-16 border" style={{ borderColor: theme.border, background: index === 1 ? theme.cardBg : theme.paperBg }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F4F7F5]">
      <img src={src} alt={template.name} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(8,21,25,0.14))]" />
      <div className="absolute left-4 right-4 top-4 overflow-hidden rounded-[10px] border border-white/70 bg-white/90 shadow-[0_14px_40px_rgba(16,40,36,0.14)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-[#E3EAE7] px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-[#ff6b5a]" />
          <span className="h-2 w-2 rounded-full bg-[#f5bf4f]" />
          <span className="h-2 w-2 rounded-full bg-[#0FA493]" />
          <span className="ml-auto h-2 w-14 rounded-full bg-[#E3EAE7]" />
        </div>
        <div className="grid grid-cols-[0.8fr_1.2fr] gap-3 p-3" style={{ background: theme.paperBg }}>
          <div className="rounded-[8px] p-3" style={{ background: theme.heroBg }}>
            <div className="mb-2 h-1.5 w-12 rounded-full" style={{ background: theme.accent }} />
            <div className="mb-1.5 h-2.5 w-20 rounded-full bg-white/70" />
            <div className="h-2 w-14 rounded-full bg-white/45" />
            <div className="mt-3 h-5 w-16 rounded-full" style={{ background: theme.accent }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="overflow-hidden rounded-[7px] border border-black/5" style={{ background: theme.cardBg }}>
                <div className={large ? "h-16" : "h-10"} style={{ background: swatches(template)[index % 4] }} />
                <div className="space-y-1 p-1.5">
                  <div className="h-1.5 rounded-full bg-black/15" />
                  <div className="h-1.5 w-2/3 rounded-full bg-black/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildPreviewStore(template: TemplateGalleryItem): SurfaceStore {
  const categoryName = categoryLabel(template.category);
  return {
    id: `preview-${template.id}`,
    name: template.name,
    slug: template.id,
    description: template.description,
    logoUrl: null,
    city: "Lagos",
    country: "Nigeria",
    currency: "NGN",
    storeProducts: [
      {
        id: `${template.id}-preview-1`,
        name: "Signature product",
        description: `A featured ${categoryName.toLowerCase()} product for this look.`,
        images: [],
        retailPrice: 18500,
        currency: "NGN",
        category: { id: "new", name: "New arrivals", slug: "new-arrivals" },
        avgRating: 4.8,
        reviewCount: 32,
      },
      {
        id: `${template.id}-preview-2`,
        name: "Customer favorite",
        description: "A polished starter product that you can swap for your own products.",
        images: [],
        retailPrice: 26000,
        currency: "NGN",
        category: { id: "best", name: "Best sellers", slug: "best-sellers" },
        avgRating: 4.7,
        reviewCount: 18,
      },
      {
        id: `${template.id}-preview-3`,
        name: "New arrival edit",
        description: "A flexible product card connected to the native editor model.",
        images: [],
        retailPrice: 32000,
        currency: "NGN",
        category: { id: "edit", name: "Curated edit", slug: "curated-edit" },
        avgRating: 4.9,
        reviewCount: 11,
      },
    ],
  };
}

function ThemeCard({
  template,
  isCurrent,
  applying,
  onApply,
  onPreview,
}: {
  template: TemplateGalleryItem;
  isCurrent: boolean;
  applying: boolean;
  onApply: () => void;
  onPreview: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-[8px] border border-[#E3EAE7] bg-white shadow-[0_1px_2px_rgba(16,40,36,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(16,40,36,0.14)]">
      <div className="relative h-[220px] overflow-hidden border-b border-[#E3EAE7]">
        <MiniStorePreview template={template} />
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${isCurrent ? "bg-[#0FA493] text-white" : "bg-[#F4F7F5] text-[#51635D]"}`}>
          {isCurrent ? "Active" : template.tags.includes("popular") ? "Popular" : "Free"}
        </span>
        <div className="absolute inset-0 flex items-end justify-center gap-2 bg-[linear-gradient(180deg,transparent_48%,rgba(8,21,25,0.86))] p-4 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onApply}
            disabled={applying || isCurrent}
            className="inline-flex items-center gap-2 rounded-[8px] bg-[#0FA493] px-4 py-2 text-[12px] font-bold text-white transition hover:bg-[#0B8074] disabled:cursor-default disabled:opacity-65"
          >
            <Icon name="rocket" size={14} />
            {isCurrent ? "In use" : applying ? "Applying" : "Use this look"}
          </button>
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-4 py-2 text-[12px] font-bold text-white backdrop-blur transition hover:bg-white/18"
          >
            <Icon name="eye" size={14} />
            Preview
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-bold text-[#16302B]">{template.name}</h2>
          <p className="mt-0.5 truncate text-[12px] text-[#7E8F89]">{template.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {swatches(template).slice(0, 3).map((color, index) => (
            <span key={`${template.id}-${color}-${index}`} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: color }} />
          ))}
        </div>
      </div>
    </article>
  );
}

function ThemePreview({
  template,
  applying,
  onClose,
  onApply,
}: {
  template: TemplateGalleryItem;
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const nativeSnapshot = useMemo<StoreEditorSnapshot | null>(() => {
    const manifest = getTemplateManifest(template.id);
    return manifest ? createSnapshotFromTemplate(manifest) : null;
  }, [template.id]);
  const previewStore = useMemo(() => buildPreviewStore(template), [template]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[rgba(22,48,43,0.72)]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#E3EAE7] bg-white px-5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-[#16302B]">{template.name}</div>
          <div className="text-[11px] text-[#51635D]">{categoryLabel(template.category)} theme</div>
        </div>
        <span className="rounded-full bg-[#F4F7F5] px-2.5 py-1 text-[10px] font-bold text-[#51635D]">{categoryLabel(template.category)}</span>
        <div className="flex flex-1 justify-center">
          <div className="flex gap-0.5 rounded-[9px] bg-[#F4F7F5] p-1">
            {(["desktop", "mobile"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDevice(item)}
                className={`grid h-8 w-9 place-items-center rounded-[6px] ${device === item ? "bg-[#0FA493] text-white" : "text-[#7E8F89]"}`}
                title={item}
              >
                <Icon name={item === "desktop" ? "monitor" : "phone"} size={16} />
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-[8px] border border-[#E3EAE7] px-4 py-2 text-[12px] font-bold text-[#51635D]">
          Close
        </button>
        <button type="button" onClick={onApply} disabled={applying} className="inline-flex items-center gap-2 rounded-[8px] bg-[#0FA493] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-60">
          Use this look
          <Icon name="arrow" size={14} />
        </button>
      </header>
      <div className="flex flex-1 justify-center overflow-y-auto bg-[#F2F5F3] p-6">
        <div className="h-[760px] max-h-full overflow-hidden rounded-[12px] border border-[#E3EAE7] bg-white shadow-[0_24px_72px_rgba(16,40,36,0.28)] transition-all" style={{ width: device === "mobile" ? 412 : 1100, maxWidth: "100%" }}>
          {nativeSnapshot ? (
            <div className="h-full overflow-y-auto bg-white">
              <TemplateStorefrontSurface
                store={previewStore}
                snapshot={nativeSnapshot}
                mode="editor"
                device={device}
                selectedPage="home"
              />
            </div>
          ) : (
            <MiniStorePreview template={template} large />
          )}
        </div>
      </div>
    </div>
  );
}

export function TemplateGallery({
  currentTemplateId,
  storeName,
  initialCategory,
}: {
  currentTemplateId?: string | null;
  storeName?: string | null;
  initialCategory?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<TemplateGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">(() => inferredCategory(initialCategory));
  const [searchValue, setSearchValue] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateGalleryItem | null>(null);
  const nextPath = searchParams.get("next") ?? "/seller/store/builder";

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      try {
        const response = await fetch("/api/store/templates", { cache: "no-store" });
        const json = (await response.json()) as { data?: { templates?: TemplateGalleryItem[] } };
        if (!cancelled) setTemplates(json.data?.templates ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesCategory = activeCategory === "all" || template.category === activeCategory;
      const matchesSearch =
        !query ||
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.sourcePack.toLowerCase().includes(query) ||
        template.layoutFamily.toLowerCase().includes(query) ||
        template.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        template.aiHints.some((hint) => hint.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchValue, templates]);

  const currentTemplate = templates.find((template) => template.id === currentTemplateId) ?? null;
  const displayedTemplates = currentTemplate
    ? [currentTemplate, ...filteredTemplates.filter((template) => template.id !== currentTemplate.id)]
    : filteredTemplates;

  async function applyTemplate(templateId: string, destination = nextPath) {
    setApplyingId(templateId);
    setApplyError(null);
    try {
      const response = await fetch("/api/store/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setApplyError(json?.error?.message ?? "That look didn't switch. Check your connection and try again.");
        return;
      }
      startTransition(() => router.push(destination));
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "That look didn't switch. Check your connection and try again.");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F5F3] text-[#16302B]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#E3EAE7] bg-white px-5">
        <button type="button" onClick={() => router.push("/seller/store/builder")} className="inline-flex items-center gap-2 rounded-[8px] px-2 py-2 text-[13px] font-bold text-[#51635D] transition hover:bg-[#F4F7F5] hover:text-[#16302B]">
          <Icon name="arrowLeft" size={16} />
          Back
        </button>
        <div className="h-6 w-px bg-[#E3EAE7]" />
        <h1 className="text-[15px] font-bold">Shop looks</h1>
        <span className="rounded-full bg-[#E6F6F2] px-2.5 py-1 text-[10px] font-bold text-[#0FA493]">200+ shop looks</span>
        <div className="ml-auto">
          <button type="button" onClick={() => router.push("/builder/rex")} className="inline-flex items-center gap-2 rounded-[8px] border border-[#E3EAE7] bg-white px-3 py-2 text-[12px] font-bold text-[#51635D] transition hover:border-[#0FA493] hover:text-[#0FA493]">
            <Icon name="sparkle" size={14} />
            Or let Rex build one
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1300px] px-6 py-8 md:px-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-[30px] font-extrabold tracking-[0] text-[#16302B]">Pick a starting point</h2>
              <p className="mt-2 max-w-[760px] text-[15px] leading-6 text-[#51635D]">
                Every theme is mobile-first and ready for {storeName ?? "your store"}. Rex adapts it to your brand, then you can change anything in the editor.
              </p>
            </div>
            <label className="relative w-full max-w-[360px]">
              <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8F89]" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search shop looks"
                className="h-10 w-full rounded-[8px] border border-[#E3EAE7] bg-white pl-9 pr-3 text-[13px] text-[#16302B] outline-none transition focus:border-[#0FA493]"
              />
            </label>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => {
              const isActive = activeCategory === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActiveCategory(option.id)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-bold transition ${isActive ? "border-[#9fd8ce] bg-[#E6F6F2] text-[#0FA493]" : "border-[#E3EAE7] bg-transparent text-[#51635D] hover:border-[#9fd8ce] hover:text-[#0FA493]"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {applyError ? (
            <div className="mb-6 rounded-[8px] border border-[#F3B6A8] bg-[#FFF4F1] px-4 py-3 text-[13px] font-semibold text-[#9B3827]">
              {applyError}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-[8px] border border-[#E3EAE7] bg-white p-6 text-[13px] text-[#51635D]">Loading shop looks…</div>
          ) : displayedTemplates.length === 0 ? (
            <div className="rounded-[8px] border border-[#E3EAE7] bg-white p-6 text-[13px] text-[#51635D]">No shop looks matched that search.</div>
          ) : (
            <div className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
              {displayedTemplates.map((template) => (
                <ThemeCard
                  key={template.id}
                  template={template}
                  isCurrent={template.id === currentTemplateId}
                  applying={applyingId === template.id}
                  onApply={() => void applyTemplate(template.id, nextPath)}
                  onPreview={() => setPreviewTemplate(template)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {previewTemplate ? (
        <ThemePreview
          template={previewTemplate}
          applying={applyingId === previewTemplate.id}
          onClose={() => setPreviewTemplate(null)}
          onApply={() => void applyTemplate(previewTemplate.id, nextPath)}
        />
      ) : null}
    </div>
  );
}
