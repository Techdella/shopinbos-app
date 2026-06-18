export type MascotName = "rex" | "peggy";
export type AuthRole = "seller" | "supplier" | "logistics_partner" | "admin";

export const logoPaths = {
  dark: "/brand/logos/shopinbos-logo-dark.png",
  light: "/brand/logos/shopinbos-logo-light.png",
  mint: "/brand/logos/shopinbos-logo-2.png",
  navy: "/brand/logos/shopinbos-logo-4.png",
  gradient: "/brand/logos/shopinbos-logo-1.png",
  iconDark: "/brand/logos/shopping boss black icon.png",
  iconLight: "/brand/logos/shopping boss white icon.png",
  iconCoffee: "/brand/logos/shopping boss coffee icon.png",
} as const;

export const mascotPaths: Record<MascotName, string[]> = {
  rex: [
    "/brand/mascots/rex-1.png",
    "/brand/mascots/rex-2.png",
    "/brand/mascots/rex-3.png",
  ],
  peggy: [
    "/brand/mascots/peggy-1.png",
    "/brand/mascots/peggy-2.png",
    "/brand/mascots/peggy-3.png",
  ],
};

export const heroImages = [
  "/brand/hero/pasted_file_JPWoNE_image.png",
  "/brand/hero/pasted_file_WueftE_image.png",
];

export function pickMascot(role: AuthRole, variant = 0): { name: MascotName; src: string } {
  const mascot: MascotName = role === "seller" ? "peggy" : "rex";
  const frames = mascotPaths[mascot];
  return { name: mascot, src: frames[variant % frames.length] };
}

export function roleLabel(role: AuthRole) {
  switch (role) {
    case "supplier":
      return "Supplier";
    case "logistics_partner":
      return "Logistics partner";
    case "admin":
      return "Admin";
    default:
      return "Seller";
  }
}

export function roleDestination(role: AuthRole) {
  switch (role) {
    case "supplier":
      return "/supplier/dashboard";
    case "logistics_partner":
      return "/logistics/dashboard";
    case "admin":
      return "/admin/dashboard";
    default:
      return "/home";
  }
}
