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

/** Draws all three logo ideas; keeps the ones that worked and the reasons the others failed. */
export async function drawLogoOptions(
  input: { businessName: string; business: string; paletteHint?: string; userId: string },
  draw: (prompt: string, path: string) => Promise<string>,
): Promise<{ logos: LogoOption[]; failures: string[] }> {
  const results = await Promise.allSettled(
    LOGO_STYLES.map(async ({ style, label, prompt, palette }) => {
      const url = await draw(prompt(input.businessName.trim().slice(0, 80), (input.business || "retail business").slice(0, 300), input.paletteHint?.slice(0, 200)), `logos/${input.userId}/${style}-${Date.now()}`);
      return { style, label, url, palette };
    }),
  );
  return {
    logos: results.filter((r): r is PromiseFulfilledResult<LogoOption> => r.status === "fulfilled").map((r) => r.value),
    failures: results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error)?.message ?? "unknown"),
  };
}
