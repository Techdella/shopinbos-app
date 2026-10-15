// A sample product for designing the product page in the builder before the store has products of its own.
// Only ever rendered in the builder, under a "Sample product" note; nothing here is saved or shown to shoppers.

import { demoProducts } from "@/lib/store-templates/demo-catalogue";
import type { BoutiqueProductDetail } from "../BoutiqueProductView";

const FOOD_THEMES = new Set(["pantry", "ounje", "chinchin", "oko"]);

export function samplePdpProduct(themeId: string, currency: string): BoutiqueProductDetail {
  const [first, second, third] = demoProducts(themeId, { accent: "#2E7E78", ink: "#151515", cardBg: "#F2EFE8", paperBg: "#FFFFFF" });
  const food = FOOD_THEMES.has(themeId);
  const variants = food
    ? [
        { name: "Regular", price: first!.retailPrice, stock: 12 },
        { name: "Family pack", price: Math.round(first!.retailPrice * 1.8), stock: 3 },
      ]
    : ["Black", "Cream"].flatMap((color, c) => ["S", "M", "L"].map((size, s) => ({ color, size, price: first!.retailPrice, stock: c === 1 && s === 2 ? 0 : c === 0 && s === 1 ? 3 : 8 })));
  return {
    ...first!,
    id: "sample-product",
    currency,
    compareAtPrice: first!.compareAtPrice ?? Math.round((first!.retailPrice * 1.25) / 100) * 100,
    images: [first, second, third].flatMap((entry) => entry?.images ?? []).slice(0, 3),
    variants,
    sku: "SAMPLE-001",
    longDescription: `${first!.description}\n\nThis is sample text. Your own product's full description shows here.`,
    specifications: food
      ? [{ name: "Serves", value: "2 to 3" }, { name: "Keeps", value: "2 days in the fridge" }]
      : [{ name: "Material", value: "100% cotton" }, { name: "Fit", value: "True to size" }, { name: "Made in", value: "Lagos" }],
    careInstructions: food ? "Keep cool. Reheat until piping hot." : "Hand wash cold. Dry in the shade.",
    returnPolicy: "Sample text: your return policy shows here.",
    faqs: [{ question: "How long does delivery take?", answer: "Sample answer: your product FAQs show here." }],
    tags: [],
  };
}
