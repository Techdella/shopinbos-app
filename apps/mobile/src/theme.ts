import { Platform } from "react-native";
import { colors, radii } from "@shared/tokens";

export { colors, radii };

// Plus Jakarta Sans ships one file per weight; Android ignores fontWeight for custom fonts, so pick the family.
export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  /** Bricolage Grotesque: big titles, headings and numbers (the 2026 "Simple app, end to end" prototype). */
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  /** The system monospace face: codes people copy letter by letter (DNS records), where "x" must not read as "×". */
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }),
} as const;
