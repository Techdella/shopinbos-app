import { colors, radii } from "@shared/tokens";

export { colors, radii };

// Plus Jakarta Sans ships one file per weight; Android ignores fontWeight for custom fonts, so pick the family.
export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;
