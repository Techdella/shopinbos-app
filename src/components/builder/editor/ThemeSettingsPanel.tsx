"use client";

import { useId, type ReactNode } from "react";
import type { StoreEditorSnapshot, ThemeTokenSet } from "@/lib/store-templates";
import type { StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { sectionCopy, type RendererKind } from "./editor-logic";
import { FieldShell, inputClass, NavRow, PanelHeading, PillGroup } from "./ui";
import { useEditorT } from "./i18n";

export type ThemeView = "colours" | "typography" | "buttons" | "cart" | "social" | "checkout";

const COLOUR_TOKENS: Array<[keyof ThemeTokenSet, string]> = [
  ["paperBg", "Page background"],
  ["ink", "Text"],
  ["muted", "Soft text"],
  ["accent", "Accent"],
  ["ctaBg", "Buttons"],
  ["ctaText", "Button text"],
  ["heroBg", "Banner and announcement background"],
  ["heroText", "Banner and announcement text"],
  ["cardBg", "Cards"],
  ["border", "Lines"],
];

const VIEWS: Array<{ id: ThemeView; label: string }> = [
  { id: "colours", label: "Colours" },
  { id: "typography", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "cart", label: "Cart" },
  { id: "social", label: "Social media" },
  { id: "checkout", label: "Checkout" },
];

export interface ThemeSettingsPanelProps {
  draft: StoreEditorSnapshot;
  renderer: RendererKind;
  shopper: StorefrontShopperInfo;
  view: ThemeView | null;
  onView: (view: ThemeView | null) => void;
  onTheme: (key: keyof ThemeTokenSet, value: string) => void;
  /** Sets a header copy value on every page, so the label is the same wherever shoppers are. */
  onHeaderCopy: (key: string, value: string) => void;
  onClose: () => void;
}

export function ThemeSettingsPanel(props: ThemeSettingsPanelProps) {
  const { draft, view } = props;
  const { t, tx } = useEditorT();
  if (!view) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeading title="Theme settings" sub={t("edk.themeSub", { name: draft.templateName })} onClose={props.onClose} />
        <nav aria-label={tx("Theme settings")} className="min-h-0 flex-1 overflow-y-auto px-4">
          {VIEWS.map((entry) => <NavRow key={entry.id} label={entry.label} onClick={() => props.onView(entry.id)} />)}
        </nav>
      </div>
    );
  }
  const title = VIEWS.find((entry) => entry.id === view)?.label ?? "Theme settings";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading title={title} onBack={() => props.onView(null)} onClose={props.onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {view === "colours" ? <Colours {...props} /> : null}
        {view === "typography" ? <Typography {...props} /> : null}
        {view === "buttons" ? <Buttons {...props} /> : null}
        {view === "cart" ? <Cart {...props} /> : null}
        {view === "social" ? <Social {...props} /> : null}
        {view === "checkout" ? <Checkout {...props} /> : null}
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  const { tx } = useEditorT();
  return <p className="my-2 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-5 text-app-ink-soft">{typeof children === "string" ? tx(children) : children}</p>;
}

function ColourRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t, tx } = useEditorT();
  const id = useId();
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <FieldShell id={id} label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={t("edk.picker", { label: tx(label) })} value={valid ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
        <input id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      </div>
    </FieldShell>
  );
}

function Colours(props: ThemeSettingsPanelProps) {
  const { tx } = useEditorT();
  return (
    <>
      <Note>Colours apply to every page. Your Brand kit sets them when a theme is first applied.</Note>
      {COLOUR_TOKENS.map(([key, label]) => (
        <ColourRow key={key} label={label} value={String(props.draft.themeTokens[key] ?? "")} onChange={(value) => props.onTheme(key, value)} />
      ))}
      <a href="/home/brand-kit" className="mt-2 inline-flex min-h-10 items-center text-[13.5px] font-semibold text-app-ink underline">{tx("Open Brand kit")}</a>
    </>
  );
}

function Typography(props: ThemeSettingsPanelProps) {
  const { t, tx } = useEditorT();
  if (props.renderer === "boutique") {
    return (
      <>
        <Note>{t("edk.typePairing", { name: props.draft.templateName })}</Note>
        <a href="/home/brand-kit" className="inline-flex min-h-10 items-center text-[13.5px] font-semibold text-app-ink underline">{tx("Open Brand kit")}</a>
      </>
    );
  }
  return (
    <FieldShell label="Headings">
      <PillGroup
        label="Heading font"
        value={props.draft.themeTokens.headingStyle}
        onChange={(value) => props.onTheme("headingStyle", value)}
        options={[{ value: "serif", label: "Serif" }, { value: "grotesk", label: "Modern" }]}
      />
    </FieldShell>
  );
}

function Buttons(props: ThemeSettingsPanelProps) {
  const { t } = useEditorT();
  return (
    <>
      {props.renderer === "boutique" ? (
        <Note>{t("edk.buttonShape", { name: props.draft.templateName })}</Note>
      ) : (
        <FieldShell label="Corners" help="Also rounds cards and images.">
          <PillGroup
            label="Corners"
            value={props.draft.themeTokens.radius}
            onChange={(value) => props.onTheme("radius", value)}
            options={[{ value: "sharp", label: "Sharp" }, { value: "rounded", label: "Rounded" }, { value: "soft", label: "Soft" }]}
          />
        </FieldShell>
      )}
      <ColourRow label="Button colour" value={props.draft.themeTokens.ctaBg} onChange={(value) => props.onTheme("ctaBg", value)} />
      <ColourRow label="Button text" value={props.draft.themeTokens.ctaText} onChange={(value) => props.onTheme("ctaText", value)} />
    </>
  );
}

function Cart(props: ThemeSettingsPanelProps) {
  const { tx } = useEditorT();
  const id = useId();
  const header = props.draft.pages.flatMap((page) => page.sections).find((section) => section.kind === "header");
  const label = String(sectionCopy(header).cartLabel ?? "");
  return (
    <>
      {header ? (
        <FieldShell id={id} label="Bag label" help="Shown in the header on every page.">
          <input id={id} className={inputClass} value={label} placeholder={props.renderer === "boutique" ? tx("My bag") : tx("Cart")} onChange={(event) => props.onHeaderCopy("cartLabel", event.target.value)} />
        </FieldShell>
      ) : <Note>Add a header to show the bag.</Note>}
      <Note>Delivery fees and free-delivery promises in the bag come from your delivery settings.</Note>
      <NavRow label="Delivery settings" href="/home/shipping" />
    </>
  );
}

function Social(props: ThemeSettingsPanelProps) {
  const { t, tx } = useEditorT();
  const number = props.shopper.whatsappNumber;
  return (
    <>
      <Note>
        {number
          ? t("edk.whatsappOn", { number: `+${number}` })
          : tx("Add a WhatsApp number and shoppers can message you from the contact page and every product page.")}
      </Note>
      <NavRow label="WhatsApp chat" sub={number ? `+${number}` : tx("Not set up")} href="/home/marketing/chat" />
      <NavRow label="Instagram, TikTok and WhatsApp selling" sub="Share products and take orders from social apps" href="/home/social" />
    </>
  );
}

function Checkout(props: ThemeSettingsPanelProps) {
  const { t, tx } = useEditorT();
  const { shopper } = props;
  return (
    <>
      <Note>
        {shopper.paymentLabels.length
          ? t("edk.payBy", { methods: shopper.paymentLabels.map((label) => tx(label)).join(", ").toLowerCase() })
          : tx("Choose how shoppers pay before you publish.")}
        {shopper.payOnDelivery ? ` ${tx("Pay on delivery is on.")}` : ""}
      </Note>
      <NavRow label="Payment methods" href="/home/payments" />
      <NavRow label="Checkout settings" sub="Fields, notes and order confirmation" href="/home/checkout" />
    </>
  );
}
