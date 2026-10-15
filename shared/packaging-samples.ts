// Sample products for the packaging template gallery: every style is shown on a believable Nigerian product of
// the chosen type, with a real product photo (free Unsplash photos, hotlinked and credited as Unsplash asks), so
// sellers see what they'll get before they pick. Made-up brands; numbers are examples.

import { EMPTY_CONTENT, newDesign, PACK_FORMATS, PACK_STYLE_INFO, PRODUCT_TYPE_INFO, type PackContent, type PackDesign, type PackFormat, type PackStyle, type ProductType } from "./packaging.ts";

const SAMPLES: Record<ProductType, Partial<PackContent>> = {
  food: { brand: "Kravings", name: "Mixed Nuts", variant: "Roasted & seasoned", tagline: "Always fresh, always crunchy", description: "Hand-picked nuts, slow roasted in small batches in Lagos.", ingredients: "Cashew nuts, almonds, walnuts, groundnut oil, sea salt.", allergens: "Contains tree nuts and peanuts.", storage: "Store in a cool dry place. Reseal after opening.", nutrition: [{ label: "Energy", value: "607 kcal" }, { label: "Fat", value: "54 g" }, { label: "Protein", value: "20 g" }, { label: "Carbohydrate", value: "21 g" }], servingSize: "100 g" },
  drinks: { brand: "Zest Naija", name: "Zobo Fresh", variant: "Ginger & pineapple", tagline: "Real hibiscus, no shortcuts", description: "Brewed from dried hibiscus with fresh ginger and pineapple.", ingredients: "Water, hibiscus, pineapple juice, ginger, cloves, cane sugar.", storage: "Keep refrigerated. Shake well. Drink within 3 days of opening.", nutrition: [{ label: "Energy", value: "48 kcal" }, { label: "Sugars", value: "11 g" }], servingSize: "100 ml" },
  beauty: { brand: "Adunni Naturals", name: "Shea Glow Butter", variant: "Cocoa & vanilla", tagline: "Soft skin, every single day", description: "Whipped Nigerian shea with cocoa butter for deep, lasting moisture.", ingredients: "Butyrospermum parkii (shea) butter, Theobroma cacao seed butter, Cocos nucifera oil, vanilla extract, tocopherol.", directions: "Warm a little between your palms and massage into damp skin.", warnings: "For external use only. Keep out of reach of children." },
  hair: { brand: "Crown & Coil", name: "Edge Growth Oil", variant: "Rosemary & chebe", tagline: "Fuller edges, naturally", description: "A light oil blend for scalp, edges and braids.", ingredients: "Ricinus communis (castor) oil, rosemary oil, chebe powder extract, jojoba oil, vitamin E.", directions: "Apply a few drops to scalp and edges. Massage gently. Use daily.", warnings: "For external use only. Patch test before use." },
  wellness: { brand: "Vita Lagos", name: "Moringa Daily", variant: "60 capsules", tagline: "Green power for busy days", description: "Pure moringa leaf powder in plant capsules.", ingredients: "Moringa oleifera leaf powder, plant cellulose capsule.", directions: "Take 2 capsules daily with water after a meal.", warnings: "Not for pregnant women or children. Do not exceed the stated dose.", storage: "Store below 25°C, away from moisture." },
  fashion: { brand: "Eko Threads", name: "Ankara Tote", variant: "Limited print", tagline: "Carry the culture", description: "Hand-sewn tote in wax-print cotton.", material: "100% cotton wax print, canvas lining.", care: "Hand wash cold. Do not bleach. Dry in shade." },
  home: { brand: "Ìfé Candles", name: "Lagos Night", variant: "Oud & lime", tagline: "Hand poured in Lagos", description: "A slow-burning soy candle with a warm, smoky scent.", material: "Soy wax, cotton wick, fragrance oil.", directions: "Trim wick to 5 mm. Burn 2 to 3 hours at a time.", warnings: "Never leave a burning candle unattended. Keep away from children and pets." },
  baby: { brand: "Little Ada", name: "Gentle Wash", variant: "Tear free", tagline: "Kind to new skin", description: "A mild head-to-toe wash for babies and little ones.", ingredients: "Aqua, coco-glucoside, glycerin, aloe barbadensis leaf juice, chamomile extract.", directions: "Lather in warm water and rinse well.", warnings: "For external use only. Avoid contact with eyes." },
  pet: { brand: "Waggy", name: "Chicken Bites", variant: "Grain free", tagline: "Treats they beg for", description: "Oven-baked chicken treats for dogs of all sizes.", ingredients: "Chicken (70%), sweet potato, egg, coconut oil.", directions: "Give 2 to 4 treats a day depending on size. Fresh water always.", storage: "Reseal and keep dry.", nutrition: [{ label: "Protein", value: "38%" }, { label: "Fat", value: "12%" }, { label: "Fibre", value: "3%" }] },
  cleaning: { brand: "Sparkle Home", name: "Lemon Fresh", variant: "Multi-surface", tagline: "Clean that smells like sunshine", description: "A concentrated cleaner for floors, tiles and kitchen tops.", ingredients: "Water, surfactants (<5%), lemon fragrance, preservative.", directions: "Mix 1 cap in 5 litres of water. Wipe and leave to dry.", warnings: "Keep out of reach of children. Do not swallow. If in eyes, rinse with water." },
  electronics: { brand: "Volt NG", name: "Fast Charger", variant: "25W USB-C", tagline: "Full power, fast", description: "A fast wall charger for phones and tablets.", specs: "Input: 100-240V ~ 50/60Hz. Output: 5V 3A / 9V 2.77A. USB-C PD.", warnings: "Keep away from water. Do not open the casing." },
  other: { brand: "Your Brand", name: "Product Name", variant: "Variant", tagline: "Your promise in a few words", description: "A short description of what it is and why people love it." },
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=700&h=700&q=80`;

/** Real product photos for the samples, with the photographer's credit. */
export const SAMPLE_PHOTOS: Record<ProductType, { url: string; credit: string; link: string }> = {
  food: { url: unsplash("1615485925873-7ecbbe90a866"), credit: "Mockup Graphics", link: "https://unsplash.com/photos/xWRwCmhcWDM" },
  drinks: { url: unsplash("1630209712184-00101e51f374"), credit: "mansi Chaudhary", link: "https://unsplash.com/photos/IsPPktr5gz0" },
  beauty: { url: unsplash("1671575192248-5d8e42f18a9c"), credit: "Giorgio Trovato", link: "https://unsplash.com/photos/41aP5jdNwGs" },
  hair: { url: unsplash("1783806706119-58cc39f90ff4"), credit: "Ela De Pure", link: "https://unsplash.com/photos/iHJzcTkD0t4" },
  wellness: { url: unsplash("1565071783280-719b01b29912"), credit: "Michele Blackwell", link: "https://unsplash.com/photos/przZDqzZKpk" },
  fashion: { url: unsplash("1738895006808-2993b28442e4"), credit: "Didi Paul", link: "https://unsplash.com/photos/a5cDtAEEYLI" },
  home: { url: unsplash("1643122966676-29e8597257f7"), credit: "pmv chamara", link: "https://unsplash.com/photos/KLU0scqbKQ0" },
  baby: { url: unsplash("1623143445418-40c192fa3d11"), credit: "Birgith Roosipuu", link: "https://unsplash.com/photos/gUZv1Fdkfgw" },
  pet: { url: unsplash("1568640347023-a616a30bc3bd"), credit: "okeykat", link: "https://unsplash.com/photos/w6elADh_jww" },
  cleaning: { url: unsplash("1777655789747-9644d9596287"), credit: "Vagaro", link: "https://unsplash.com/photos/S76_Upr40l4" },
  electronics: { url: unsplash("1492107376256-4026437926cd"), credit: "Adam Birkett", link: "https://unsplash.com/photos/6cXZnFCd2KQ" },
  other: { url: unsplash("1509912760195-4f6cfd8cce2c"), credit: "Jenn Kosar", link: "https://unsplash.com/photos/FhXZSP-4ARg" },
};

/** A sample design: a type's sample product in a style and format (the format the type uses first by default). */
export function sampleDesign(type: ProductType, style: PackStyle, format?: PackFormat): PackDesign {
  const formats = PRODUCT_TYPE_INFO[type].formats;
  // Samples default to a pack with a tall front, where every template shows at its best.
  const tall = formats.find((value) => !["jar_label", "round_sticker", "sleeve"].includes(value)) ?? formats[0];
  const chosen = format && PACK_FORMATS.includes(format) ? format : tall;
  const design = newDesign({ productType: type, style, format: chosen, brand: SAMPLES[type].brand ?? "Your Brand", name: SAMPLES[type].name });
  design.content = { ...EMPTY_CONTENT, ...design.content, ...SAMPLES[type], barcode: "5901234123457", qrUrl: "https://shopinbos.com", regNumber: PRODUCT_TYPE_INFO[type].regLabel ? "A1-0000" : "" };
  const photo = PACK_STYLE_INFO[style].photo;
  design.image = { url: SAMPLE_PHOTOS[type].url, fit: photo === "none" ? "cutout" : photo };
  return design;
}
