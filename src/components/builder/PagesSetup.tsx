"use client";

import { useState } from "react";
import { Mascot, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PageDef {
  type: string;
  label: string;
  description: string;
  required?: boolean;
  contentLabel?: string;
  contentPlaceholder?: string;
  multiline?: boolean;
}

export interface SelectedPage {
  type: string;
  label: string;
  userContent: string;
}

interface PagesSetupProps {
  storeName: string;
  category: string;
  designStyle: string; // passed from ChipBuilder — not re-asked here
  onBuild: (pages: SelectedPage[]) => void;
  onBack: () => void;
}

// ── Category-adaptive page catalogue ──────────────────────────────────────────

function getCategoryPages(cat: string): PageDef[] {
  const s = cat.toLowerCase();

  if (/fashion|cloth|wear|dress|shirt|bag|shoe|ankara|fabric/.test(s)) {
    return [
      { type: "home", label: "Home", required: true, description: "Rex writes your hero section and brand intro." },
      { type: "products", label: "Products", required: true, description: "Your full product catalogue with filters." },
      { type: "about", label: "About Us", description: "Your brand story and founding mission.", contentLabel: "Your story", contentPlaceholder: "Who you are, why you started the brand, what makes your pieces different..." },
      { type: "lookbook", label: "Lookbook / Gallery", description: "Visual showcase of your styling and pieces.", contentLabel: "Aesthetic notes (optional)", contentPlaceholder: "Describe the mood or styling direction you want..." },
      { type: "size-guide", label: "Size Guide", description: "Helps customers pick the right fit.", contentLabel: "Your sizing details", contentPlaceholder: "Measurements, how garments fit (slim, regular, oversized)..." },
      { type: "blog", label: "Blog", description: "Stories, style guides, and SEO articles for your brand.", contentLabel: "Blog topics", contentPlaceholder: "Style guides, outfit ideas, fabric care, customer stories..." },
      { type: "contact", label: "Contact", description: "Contact details and a message form.", contentLabel: "Your contact details", contentPlaceholder: "Email, phone, WhatsApp, address, business hours..." },
      { type: "faq", label: "FAQ", description: "Common questions Rex will answer for you.", contentLabel: "Frequently asked questions (optional)", contentPlaceholder: "What questions do customers usually ask? One per line..." },
    ];
  }

  if (/food|sauce|snack|pepper|spice|rice|bread|cake|pastry|drink|beverage|jollof|bake/.test(s)) {
    return [
      { type: "home", label: "Home", required: true, description: "Rex writes your hero section and food intro." },
      { type: "products", label: "Menu / Products", required: true, description: "Your full product or menu listing." },
      { type: "about", label: "About Us", description: "Your kitchen story and what makes your food special.", contentLabel: "Your story", contentPlaceholder: "How the business started, your cooking philosophy, what's special about your recipes..." },
      { type: "delivery", label: "Delivery & Ordering", description: "How customers can order and where you deliver.", contentLabel: "Delivery details", contentPlaceholder: "Areas covered, delivery times, minimum order, bulk order options..." },
      { type: "catering", label: "Catering", description: "Events, corporate orders, and bulk packages.", contentLabel: "Catering details", contentPlaceholder: "Event types, minimum order sizes, areas served, how to book..." },
      { type: "blog", label: "Blog", description: "Recipes, food tips, launch updates, and SEO articles.", contentLabel: "Blog topics", contentPlaceholder: "Recipe ideas, event food tips, storage guides, behind-the-scenes stories..." },
      { type: "contact", label: "Contact", description: "Contact form and your business details.", contentLabel: "Contact details", contentPlaceholder: "Email, phone, WhatsApp, address, pickup location (if any)..." },
      { type: "faq", label: "FAQ", description: "Shelf life, allergens, delivery questions — Rex will handle them.", contentLabel: "Common questions (optional)", contentPlaceholder: "What do customers usually ask? One per line..." },
    ];
  }

  if (/beauty|skin|hair|cream|soap|oil|serum|makeup|cosmetic|glow|moistur/.test(s)) {
    return [
      { type: "home", label: "Home", required: true, description: "Rex writes your hero and brand promise." },
      { type: "products", label: "Products", required: true, description: "Your full skincare / beauty range." },
      { type: "about", label: "About Us", description: "Your brand story and what drives your formulations.", contentLabel: "Your story", contentPlaceholder: "Why you started, your skin philosophy, what makes your products different..." },
      { type: "skin-guide", label: "Skin Guide", description: "A guide to help customers choose the right products.", contentLabel: "Skin guide topics (optional)", contentPlaceholder: "Skin types you address, common skin concerns, how to build a routine..." },
      { type: "results", label: "Results / Reviews", description: "Before & after stories and customer testimonials.", contentLabel: "Notable results (optional)", contentPlaceholder: "Any results or testimonials you want to highlight..." },
      { type: "blog", label: "Blog", description: "Routine guides, ingredient education, and SEO articles.", contentLabel: "Blog topics", contentPlaceholder: "Skin routines, ingredient explainers, before-and-after stories..." },
      { type: "contact", label: "Contact", description: "Customer support and consultation booking.", contentLabel: "Contact details", contentPlaceholder: "Email, phone, WhatsApp, social handles..." },
      { type: "faq", label: "FAQ", description: "Ingredients, skin types, returns — Rex will draft these.", contentLabel: "Common questions (optional)", contentPlaceholder: "Questions you get asked often... one per line" },
    ];
  }

  if (/phone|gadget|tech|electron|laptop|accessory|cable|charger/.test(s)) {
    return [
      { type: "home", label: "Home", required: true, description: "Rex writes your hero and tech value proposition." },
      { type: "products", label: "Products", required: true, description: "Your full product catalogue." },
      { type: "deals", label: "Deals & Bundles", description: "Promotions and bundle offers.", contentLabel: "Current deals (optional)", contentPlaceholder: "Any bundles or promos you want to highlight..." },
      { type: "warranty", label: "Warranty & Returns", description: "Your return policy and warranty terms.", contentLabel: "Your policy", contentPlaceholder: "Warranty period, what's covered, return window, how to claim..." },
      { type: "support", label: "Tech Support", description: "Help and troubleshooting for customers.", contentLabel: "Support details", contentPlaceholder: "How customers can get help — WhatsApp, email, walk-in..." },
      { type: "blog", label: "Blog", description: "Buying guides, comparisons, and SEO articles.", contentLabel: "Blog topics", contentPlaceholder: "Buying guides, product comparisons, troubleshooting articles..." },
      { type: "contact", label: "Contact", description: "Contact details and sales enquiry form.", contentLabel: "Contact details", contentPlaceholder: "Email, phone, WhatsApp, address, business hours..." },
      { type: "faq", label: "FAQ", description: "Compatibility, specs, delivery questions.", contentLabel: "Common questions (optional)", contentPlaceholder: "Tech questions you usually get... one per line" },
    ];
  }

  // Default / general
  return [
    { type: "home", label: "Home", required: true, description: "Rex writes your hero section and brand intro." },
    { type: "products", label: "Products", required: true, description: "Your full product catalogue." },
    { type: "about", label: "About Us", description: "Your story and what you stand for.", contentLabel: "Your story", contentPlaceholder: "Who you are, why you started, what makes your business different..." },
    { type: "contact", label: "Contact", description: "A contact form and your business details.", contentLabel: "Contact details", contentPlaceholder: "Email, phone, WhatsApp, address, business hours..." },
    { type: "faq", label: "FAQ", description: "Common questions Rex will answer for you.", contentLabel: "Questions customers ask (optional)", contentPlaceholder: "One per line..." },
    { type: "blog", label: "Blog", description: "Tips, stories, and updates from your brand.", contentLabel: "Blog topics", contentPlaceholder: "What topics would you write about?" },
  ];
}

// ── Style label ────────────────────────────────────────────────────────────────

const STYLE_LABELS: Record<string, string> = {
  classic: "Classic layout",
  bold: "Bold & Modern layout",
  editorial: "Editorial layout",
  minimal: "Clean & Minimal layout",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PagesSetup({ storeName, category, designStyle, onBuild, onBack }: PagesSetupProps) {
  const pages = getCategoryPages(category);
  const [selected, setSelected] = useState<string[]>(["home", "products"]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [peggyLoading, setPeggyLoading] = useState<string | null>(null);
  const [peggyError, setPeggyError] = useState<{ type: string; message: string } | null>(null);

  function togglePage(type: string) {
    const page = pages.find((p) => p.type === type);
    if (page?.required) return;
    setSelected((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function setPageContent(type: string, value: string) {
    setContent((prev) => ({ ...prev, [type]: value }));
  }

  async function askPeggy(type: string, page: PageDef) {
    if (!storeName || peggyLoading) return;
    setPeggyLoading(type);
    setPeggyError(null);
    try {
      const res = await fetch("/api/ai/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: `content brief for the "${page.label}" page of an online store`,
          instructions: "3-4 sentences describing what this page should tell the store's customers. Plain text, written as notes the store owner can edit.",
          context: {
            store: storeName,
            category,
            page: page.label,
            "what the page needs": page.contentLabel ?? "",
            "seller's notes so far": content[type] ?? "",
          },
          maxWords: 90,
        }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { text?: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data?.text) throw new Error(json?.error?.message ?? "Peggy couldn't write that right now.");
      setPageContent(type, json.data.text);
    } catch (error) {
      setPeggyError({ type, message: error instanceof Error ? error.message : "Peggy couldn't write that right now." });
    } finally {
      setPeggyLoading(null);
    }
  }

  function handleBuild() {
    const selectedPages: SelectedPage[] = pages
      .filter((p) => selected.includes(p.type))
      .map((p) => ({ type: p.type, label: p.label, userContent: content[p.type] ?? "" }));
    onBuild(selectedPages);
  }

  const optionalSelected = selected.filter((t) => !pages.find((p) => p.type === t)?.required);

  return (
    <div className="flex flex-col gap-6 font-app text-app-ink">
      <div className="flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5">
        <Mascot name="rex" className="h-9 w-9 shrink-0" alt="Rex" />
        <div className="min-w-0">
          <p className="m-0 text-[14px] leading-[1.55]">
            Pick the pages <strong>{storeName || "your store"}</strong> needs. I write all the copy; add your details where it helps.
            Peggy can draft any notes you leave blank.
          </p>
          <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">
            Layout: {STYLE_LABELS[designStyle] ?? "Classic layout"}, from your brand setup.
          </p>
        </div>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 p-0 text-[15px] font-extrabold">Pages</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {pages.map((p) => {
            const active = selected.includes(p.type);
            return (
              <button
                key={p.type}
                type="button"
                role="checkbox"
                aria-checked={active}
                aria-disabled={p.required || undefined}
                onClick={() => togglePage(p.type)}
                className={cx(
                  "flex min-h-[68px] items-start gap-3 rounded-[18px] border-2 bg-white px-4 py-3 text-left transition",
                  active ? "border-app-ink" : "border-app-line hover:border-app-line-strong",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-extrabold">{p.label}</span>
                    {p.required && <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[11.5px] font-bold text-app-ink-soft">Always on</span>}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-[1.45] text-app-ink-soft">{p.description}</span>
                </span>
                <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", active ? "border-app-ink bg-app-ink text-white" : "border-app-line-strong")}>
                  {active && <Icon name="check" size={11} />}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {optionalSelected.length > 0 && (
        <div className="grid gap-3">
          <h3 className="m-0 text-[15px] font-extrabold">Add your details, Rex writes the rest</h3>
          {optionalSelected.map((type) => {
            const page = pages.find((p) => p.type === type)!;
            if (!page?.contentLabel) return null;
            const isLoading = peggyLoading === type;
            const fieldId = `page-notes-${type}`;
            return (
              <div key={type} className="rounded-[18px] border border-app-line bg-white p-4">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={fieldId} className="min-w-0">
                    <span className="block text-[14.5px] font-extrabold">{page.label}</span>
                    <span className="block text-[13px] text-app-ink-soft">{page.contentLabel}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => askPeggy(type, page)}
                    disabled={isLoading}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-mint px-3 text-[13px] font-bold text-app-forest disabled:opacity-50"
                  >
                    {isLoading ? "Writing…" : "Ask Peggy"}
                  </button>
                </div>
                <textarea
                  id={fieldId}
                  rows={page.multiline ? 4 : 3}
                  value={content[type] ?? ""}
                  onChange={(e) => setPageContent(type, e.target.value)}
                  placeholder={page.contentPlaceholder}
                  className="w-full resize-y rounded-[14px] border border-app-line bg-white px-3.5 py-3 text-[14.5px] leading-[1.55] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink"
                />
                {peggyError?.type === type && <p role="alert" className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{peggyError.message}</p>}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-[18px] bg-app-canvas px-4 py-3.5">
        <p className="m-0 text-[13.5px] font-bold">Rex writes for every page</p>
        <p className="mb-0 mt-1 text-[13px] leading-[1.6] text-app-ink-soft">
          Headlines, section copy, button text, search descriptions and the footer, plus bag, payment and product pages. Picking Blog also sets up your blog.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillButton size="md" tone="white" onClick={onBack}>Back</PillButton>
        <PillButton size="md" tone="accent" onClick={handleBuild}>Build my store</PillButton>
      </div>
    </div>
  );
}
