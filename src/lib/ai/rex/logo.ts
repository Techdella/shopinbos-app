// Logo ideas for the logo studio (/studio/logo, via /api/ai/generate-logo) and Rex's generate_logo tool:
// three styles, each a prompt for the image model and a matching starter palette.

type LogoPromptFn = (name: string, business: string, paletteHint?: string) => string;

export const LOGO_STYLES: {
  style: string;
  label: string;
  prompt: LogoPromptFn;
  palette: { primary: string; secondary: string; accent: string };
}[] = [
  {
    style: "minimalist",
    label: "Clean & Minimal",
    prompt: (name, business, paletteHint) =>
      `A high quality logo for "${name}", a ${business}. Minimalist and professional with simple geometric forms, one or two colors, refined sans-serif typography, white or transparent background, modern branding style suitable for digital storefronts.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#0E2A38", secondary: "#73D8C8", accent: "#FAF7F1" },
  },
  {
    style: "bold",
    label: "Bold & Vibrant",
    prompt: (name, business, paletteHint) =>
      `A high quality logo for "${name}", a ${business}. Bold and vibrant with strong typography, African-inspired color energy, memorable mark, and a modern wordmark. Clean composition on a white or transparent background, suitable for branding and e-commerce.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#B33A1C", secondary: "#F2A93B", accent: "#FAF7F1" },
  },
  {
    style: "illustrative",
    label: "Illustrative & Warm",
    prompt: (name, business, paletteHint) =>
      `A high quality logo for "${name}", a ${business}. Warm and illustrative with an approachable icon or mark, elegant typography, earthy tones, and premium West African-inspired styling. White or transparent background, polished and ready for digital use.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#7B4F2E", secondary: "#F2A93B", accent: "#FAF7F1" },
  },
];

export type LogoOption = { style: string; label: string; url: string; palette: { primary: string; secondary: string; accent: string } };

/** Fresh directions for "New ideas" (round 2, 3, …), so a new round doesn't repeat the last one. */
const FRESH_DIRECTIONS = [
  "Try a completely different concept from a typical logo for this kind of business: a fresh symbol idea and different letterforms.",
  "Try a monogram or lettermark built from the initials, with a distinctive shape.",
  "Try a badge or emblem shape with the name integrated.",
  "Try a playful hand-drawn feel with a friendly mascot-like mark.",
  "Try a premium luxury direction: elegant serif lettering and a refined small mark.",
];

type LogoInput = { businessName: string; business: string; paletteHint?: string; userId: string; round?: number };

async function settle(jobs: Array<Promise<LogoOption>>) {
  const results = await Promise.allSettled(jobs);
  return {
    logos: results.filter((r): r is PromiseFulfilledResult<LogoOption> => r.status === "fulfilled").map((r) => r.value),
    failures: results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error)?.message ?? "unknown"),
  };
}

/** Draws all three logo ideas; keeps the ones that worked and the reasons the others failed. */
export async function drawLogoOptions(
  input: LogoInput,
  draw: (prompt: string, path: string) => Promise<string>,
): Promise<{ logos: LogoOption[]; failures: string[] }> {
  const round = input.round ?? 1;
  const fresh = round > 1 ? ` ${FRESH_DIRECTIONS[(round - 2) % FRESH_DIRECTIONS.length]}` : "";
  return settle(
    LOGO_STYLES.map(async ({ style, label, prompt, palette }) => {
      const url = await draw(`${prompt(input.businessName.trim().slice(0, 80), (input.business || "retail business").slice(0, 300), input.paletteHint?.slice(0, 200))}${fresh}`, `logos/${input.userId}/${style}-${Date.now()}`);
      return { style, label, url, palette };
    }),
  );
}

const VARIATIONS = [
  { style: "refined", label: "Refined", ask: "Refine this exact logo: keep its idea, layout and colours, but make the lines cleaner, the lettering crisper and the balance better." },
  { style: "new-colours", label: "New colours", ask: "Keep this logo's shapes and lettering exactly, but try a different, harmonious colour palette." },
  { style: "simplified", label: "Simplified mark", ask: "Make a simpler version of this logo that still reads well as a small app icon or profile picture: fewer details, same spirit." },
];

/** "More like this": three variations of one logo (passed to the image model as the reference). */
export async function drawLogoVariations(
  input: LogoInput,
  draw: (prompt: string, path: string) => Promise<string>,
): Promise<{ logos: LogoOption[]; failures: string[] }> {
  const name = input.businessName.trim().slice(0, 80);
  return settle(
    VARIATIONS.map(async ({ style, label, ask }, index) => {
      const url = await draw(
        `${ask} The business name on the logo is "${name}"; spell it exactly. White or transparent background.${input.paletteHint ? ` ${input.paletteHint.slice(0, 200)}` : ""}`,
        `logos/${input.userId}/${style}-${Date.now()}`,
      );
      return { style, label, url, palette: LOGO_STYLES[index % LOGO_STYLES.length].palette };
    }),
  );
}
