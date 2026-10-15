"use client";

import { useId, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import type { BoutiqueLook } from "../look";
import { productDetailRows } from "@shared/product-types";
import { FaqList } from "../faq/FaqList";
import { detailPanels, type FaqRow, type PdpDetailsStyle, type PdpFaqSettings, type PdpPanelId, type PdpProductContent } from "./pdp-logic";

interface Props {
  product: PdpProductContent & { sku?: string | null; productType?: string | null; productDetails?: unknown };
  sku?: string | null;
  look: BoutiqueLook;
  style: PdpDetailsStyle;
  deliveryLines: Array<{ place: string; detail: string }>;
  storeName: string;
  hasWhatsapp: boolean;
  /** Builder preview: say which panels are hidden because the product has nothing for them. */
  editor: boolean;
  /** The questions (the product's own, plus the store's when switched on) and how they show. */
  faq: { items: FaqRow[]; settings: PdpFaqSettings };
}

/** Description, specifications, care, shipping and returns, warranty and FAQs, as an accordion or tabs. */
export function PdpDetails({ product, sku, look, style, deliveryLines, storeName, hasWhatsapp, editor, faq }: Props) {
  const t = look.tokens;
  const uid = useId();
  // Type details (fabric, size guide…) and the seller's own rows; care and warranty have their own panels.
  const specRows = productDetailRows(product);
  const panels = detailPanels(product, deliveryLines.length, specRows.length, { count: faq.items.length, title: faq.settings.title, inDetails: faq.settings.placement === "tab" });
  const [tab, setTab] = useState<PdpPanelId | null>(null);
  const active = panels.find((panel) => panel.id === tab)?.id ?? panels[0]?.id ?? null;

  if (!panels.length) {
    return editor ? (
      <div className="rounded-[12px] border border-dashed px-4 py-5 text-center text-[13px]" style={{ borderColor: t.border, color: t.muted }}>
        Product details show here once the product has a description, specifications, care, delivery or FAQs.
      </div>
    ) : null;
  }

  // The questions' heading can be typed over on the builder canvas (InlineTextEditor, copy key faqTitle).
  const panelTitle = (panel: { id: PdpPanelId; title: string }) => (panel.id === "faqs" ? <span data-inline-key="faqTitle">{panel.title}</span> : panel.title);
  const prose = "whitespace-pre-line text-[14.5px] leading-7";
  function body(id: PdpPanelId): React.ReactNode {
    switch (id) {
      case "description":
        return (
          <>
            <p className={prose} style={{ color: t.muted }}>{product.longDescription?.trim() || product.description?.trim()}</p>
            {sku ? <p className="mt-3 text-[12.5px]" style={{ color: t.muted }}>SKU {sku}</p> : null}
          </>
        );
      case "specs":
        return (
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {specRows.map((spec) => (
                <tr key={spec.label} className="border-b last:border-b-0" style={{ borderColor: t.border }}>
                  <th scope="row" className="w-2/5 py-2.5 pr-4 text-left align-top font-semibold">{spec.label}</th>
                  <td className="py-2.5 align-top" style={{ color: t.muted }}><span className="whitespace-pre-line">{spec.value}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "care":
        return <p className={prose} style={{ color: t.muted }}>{product.careInstructions}</p>;
      case "shipping":
        return (
          <div className={`grid gap-4 ${prose}`} style={{ color: t.muted }}>
            {product.shippingInfo?.trim() || deliveryLines.length ? (
              <div>
                <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Delivery</h3>
                {product.shippingInfo?.trim() ? <p className="mt-1">{product.shippingInfo}</p> : null}
                {deliveryLines.length ? (
                  <ul className="mt-1">
                    {deliveryLines.map((line) => <li key={line.place}><span style={{ color: t.ink }}>{line.place}:</span> {line.detail}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div>
              <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Returns</h3>
              <p className="mt-1">{product.returnPolicy?.trim() || `Ask ${storeName} about returns before you order${hasWhatsapp ? " on WhatsApp" : ""}.`}</p>
            </div>
          </div>
        );
      case "warranty":
        return (
          <div className={`grid gap-3 ${prose}`} style={{ color: t.muted }}>
            {product.warranty?.trim() ? <p>{product.warranty}</p> : null}
            {product.supportInfo?.trim() ? <p>{product.supportInfo}</p> : null}
          </div>
        );
      case "faqs":
        // The style picked in the builder (product page settings, else the store's FAQ section).
        return (
          <FaqList
            items={faq.items.map((item, i) => ({ id: `faq-${i}`, question: item.question, answer: item.answer }))}
            style={faq.settings.style}
            look={look}
            firstOpen={faq.settings.firstOpen}
            level={4}
          />
        );
    }
  }

  if (style === "tabs") {
    return (
      <div>
        <div role="tablist" aria-label="Product information" className="flex gap-6 overflow-x-auto border-b" style={{ borderColor: t.border }}>
          {panels.map((panel, i) => (
            <button
              key={panel.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${panel.id}`}
              aria-selected={active === panel.id}
              aria-controls={`${uid}-panel`}
              tabIndex={active === panel.id ? 0 : -1}
              onClick={() => setTab(panel.id)}
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                const next = panels[(i + step + panels.length) % panels.length]!;
                setTab(next.id);
                document.getElementById(`${uid}-tab-${next.id}`)?.focus();
              }}
              className="shrink-0 border-0 bg-transparent px-0 pb-3 text-[15px]"
              style={{ color: active === panel.id ? t.ink : t.muted, fontWeight: active === panel.id ? 600 : 400, borderBottom: `2px solid ${active === panel.id ? t.ink : "transparent"}`, cursor: "pointer" }}
            >
              {panelTitle(panel)}
            </button>
          ))}
        </div>
        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={active ? `${uid}-tab-${active}` : undefined} className="py-6">
          {active ? body(active) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t" style={{ borderColor: t.border }}>
      {panels.map((panel, i) => (
        <details key={panel.id} className="bq-pdp2-acc border-b" style={{ borderColor: t.border }} open={i === 0}>
          <summary className="flex min-h-14 items-center justify-between gap-4 py-3 text-[16px] font-semibold" style={{ fontFamily: look.headingFont }}>
            {panelTitle(panel)}
            <Icon name="chevDown" size={16} className="bq-pdp2-chev shrink-0" />
          </summary>
          <div className="pb-5 text-left">{body(panel.id)}</div>
        </details>
      ))}
    </div>
  );
}
