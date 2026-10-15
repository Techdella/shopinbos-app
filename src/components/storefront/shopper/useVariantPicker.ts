"use client";

import { useMemo, useState } from "react";
import {
  choose,
  initialSelection,
  isColourOption,
  matchSelection,
  normalizeVariants,
  readVariantOptions,
  valueAvailable,
  variantAvailable,
  variantCompareAt,
  variantPrice,
  type ProductVariant,
  type VariantOption,
} from "@shared/product-variants";

// Choosing a version on a storefront product page (both theme systems): the options with what can still be bought,
// and the chosen version's price, "was" price, stock, photo and what goes into the bag.

export interface VariantPickerProduct {
  retailPrice: number;
  compareAtPrice?: number | null;
  variants?: unknown;
  variantOptions?: unknown;
}

export interface VariantPicker {
  variants: ProductVariant[];
  options: Array<VariantOption & { colour: boolean }>;
  selection: Record<string, string>;
  pick: (optionName: string, value: string) => void;
  /** Whether a value leads to a version that is on and in stock (else greyed out). */
  available: (optionName: string, value: string) => boolean;
  selected: ProductVariant | null;
  price: number;
  compareAt: number | null;
  /** Units left of the chosen version when counted; null otherwise. */
  stock: number | null;
  soldOut: boolean;
  image: string | null;
  /** Bag line fields: the label shown and the version id the checkout prices from. */
  line: { variant?: string; variantId?: string };
}

export function useVariantPicker(product: VariantPickerProduct): VariantPicker {
  const variants = useMemo(() => normalizeVariants(product.variants), [product.variants]);
  const options = useMemo(
    () => readVariantOptions(product.variantOptions, variants).map((option) => ({ ...option, colour: isColourOption(option.name) })),
    [product.variantOptions, variants],
  );
  const names = useMemo(() => options.map((option) => option.name), [options]);
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(variants));

  const selected = variants.length ? matchSelection(variants, selection, names) : null;
  const stock = selected?.stock ?? null;
  return {
    variants,
    options,
    selection,
    pick: (optionName, value) => setSelection((current) => choose(variants, current, optionName, value, names)),
    available: (optionName, value) => valueAvailable(variants, selection, optionName, value),
    selected,
    price: variantPrice(selected, product.retailPrice),
    compareAt: variantCompareAt(selected, { retailPrice: product.retailPrice, compareAtPrice: product.compareAtPrice }),
    stock,
    soldOut: variants.length > 0 && (!selected || !variantAvailable(selected)),
    image: selected?.imageUrl ?? null,
    line: selected ? { variant: selected.name, variantId: selected.id } : {},
  };
}
