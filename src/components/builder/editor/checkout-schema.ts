// Inspector fields for the checkout page (the checkout page's "checkout-form" section). Every field is read by
// readCheckoutPageSettings / readClassicCheckoutSettings (src/components/storefront/checkout/checkout-layout.ts),
// which the builder preview and the live checkout route both render with. Pure data: loaded by tests without a bundler.

import {
  CHECKOUT_LAYOUT_OPTIONS,
  CHECKOUT_SUMMARY_BLOCKS,
  CLASSIC_CHECKOUT_DEFAULTS,
  CLASSIC_CHECKOUT_LAYOUTS,
  CLASSIC_DEFAULT_CHECKOUT_LAYOUT,
  DEFAULT_SUMMARY_BLOCKS,
  checkoutThemeDefaults,
} from "../../storefront/checkout/checkout-layout.ts";
import type { FieldGroup, SchemaField, When } from "./section-schema";

const copy = (key: string) => ({ scope: "copy" as const, key });
const setting = (key: string) => ({ scope: "settings" as const, key });
const layoutIs = (layouts: string[], fallback: string): When => ({ scope: "settings", key: "checkoutLayout", in: layouts, fallback });

/** `defaults`: the layout, summary side and header shown until the seller picks one (else the theme's own). */
export function checkoutSchemaGroups(themeId: string, defaults?: { layout: string; summaryPosition: string; header: string }): FieldGroup[] {
  const theme = defaults ?? checkoutThemeDefaults(themeId);
  return [
    { fields: [
      { id: "note", type: "note", label: "Shoppers pay on this page. Payment methods, delivery fees, the phone number rule and discount codes are in Checkout settings." },
      { id: "checkoutLayout", type: "cards", label: "Layout", target: setting("checkoutLayout"), fallback: theme.layout, options: CHECKOUT_LAYOUT_OPTIONS },
      { id: "summaryPosition", type: "segmented", label: "Order summary side", target: setting("summaryPosition"), fallback: theme.summaryPosition, options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }], help: "On computers. On phones the summary folds into a bar with the total.", when: layoutIs(["two-column", "steps"], theme.layout) },
      { id: "checkoutHeader", type: "segmented", label: "Header", target: setting("checkoutHeader"), fallback: theme.header, options: [{ value: "logo", label: "Logo only" }, { value: "nav", label: "Logo and links" }], help: "Logo only keeps shoppers focused on paying.", when: { scope: "settings", key: "checkoutLayout", notIn: ["minimal"], fallback: theme.layout } },
      { id: "checkoutMessage", type: "textarea", label: "Message above the form", target: copy("checkoutMessage"), placeholder: "e.g. Orders placed before 2pm leave the same day." },
    ] },
    { title: "Order summary", fields: [
      { id: "summaryTitle", type: "text", label: "Heading", target: copy("summaryTitle"), placeholder: "Order summary" },
      { id: "summaryBlocks", type: "order", label: "Shows, in this order", target: setting("summaryBlocks"), options: CHECKOUT_SUMMARY_BLOCKS, fallback: DEFAULT_SUMMARY_BLOCKS, help: "The totals always follow the items and discount code. Parts your settings can't fill yet stay hidden for shoppers." },
      { id: "summaryThumbnails", type: "toggle", label: "Photos beside the items", target: setting("summaryThumbnails"), fallback: true },
    ] },
    { title: "Form", fields: [
      { id: "orderNote", type: "toggle", label: "Order note box", target: setting("orderNote"), fallback: true, help: "Only shows when order notes are on in Checkout settings." },
    ] },
    { title: "Buttons", fields: [
      { id: "placeOrderLabel", type: "text", label: "Place order button", target: copy("placeOrderLabel"), placeholder: "Place order", help: "Leave empty to show \"Pay ₦…\" with the total for card payments." },
      { id: "continueLabel", type: "text", label: "Continue button", target: copy("continueLabel"), placeholder: "Continue to delivery", when: layoutIs(["steps"], theme.layout) },
    ] },
  ];
}

/**
 * The same fields for classic templates (readClassicCheckoutSettings). Their starting layout follows the section's
 * saved classic `layout`, so a field whose default differs between classic layouts is listed once per default and
 * only shows (`when`) for the classic layouts that start from it. Fields that depend on the chosen checkout layout
 * also check the classic default, so they appear exactly when the preview draws them.
 */
export function classicCheckoutSchemaGroups(): FieldGroup[] {
  const variants = CLASSIC_CHECKOUT_LAYOUTS.map((layout) => ({ layout, groups: checkoutSchemaGroups("", CLASSIC_CHECKOUT_DEFAULTS[layout]) }));
  return variants[0]!.groups.map((group, g) => ({
    ...group,
    fields: group.fields.flatMap((field, f): SchemaField[] => {
      const byVariant = new Map<string, { field: SchemaField; layouts: string[] }>();
      for (const variant of variants) {
        const own = variant.groups[g]!.fields[f]!;
        const key = JSON.stringify([(own as { fallback?: unknown }).fallback ?? null, own.when ?? null]);
        const entry = byVariant.get(key) ?? { field: own, layouts: [] };
        entry.layouts.push(variant.layout);
        byVariant.set(key, entry);
      }
      if (byVariant.size === 1) return [field];
      return [...byVariant.values()].map(({ field: own, layouts }) => {
        // The copy for the default classic layout also covers sections saved with no (or an unknown) layout.
        const legacy: When = layouts.includes(CLASSIC_DEFAULT_CHECKOUT_LAYOUT)
          ? { scope: "settings", key: "layout", notIn: CLASSIC_CHECKOUT_LAYOUTS.filter((layout) => !layouts.includes(layout)), fallback: CLASSIC_DEFAULT_CHECKOUT_LAYOUT }
          : { scope: "settings", key: "layout", in: layouts, fallback: CLASSIC_DEFAULT_CHECKOUT_LAYOUT };
        const ownWhen = own.when ? (Array.isArray(own.when) ? own.when : [own.when]) : [];
        return { ...own, when: [legacy, ...ownWhen] };
      });
    }),
  }));
}
