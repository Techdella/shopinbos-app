// The screens Peggy may open on a call ("Call Peggy", the open_screen tool), per role: a short English name she says,
// the phone app's route (expo-router) and the web app's path. Only these open: anything else is refused, so she can
// never send someone to an admin page, a payment page or a page of another role. Opening a screen never presses a
// button there. Pure, unit-tested in tests/peggy-call.test.mjs; used by the phone call
// (apps/mobile/src/components/peggy/PeggyCallEngine.tsx), the web call (src/components/peggy/PeggyCall.tsx) and the
// voice agent's prompt (src/lib/ai/peggy-voice.server.ts).

export type ScreenRole = "seller" | "supplier" | "logistics_partner";

export interface PeggyScreen {
  /** What Peggy passes to open_screen. */
  id: string;
  /** What she and the toast call it ("Peggy opened Delivery"). */
  name: string;
  /** The phone app route. */
  app: string;
  /** The web app path, or null when the screen is only in the phone app. */
  web: string | null;
  /** Other words people (or Peggy) use for it. Each word belongs to one screen of the role (tested). */
  also?: string[];
  /** What it's for, in a few words, when the name alone could be mistaken (Peggy's list shows it). */
  about?: string;
}

// Seller screens that were easy to mix up (Peggy once said "Create with Rex" for "my store design" and opened the
// social post maker): the shop's design is "Shop looks" (/templates); changing the shop by chatting with Rex is
// "Edit my shop with Rex" (/rex); a social post, flyer or status is "Make a post" (/create); the posts calendar is
// "Posts calendar" (/posts). Nothing is called "Create with Rex" any more.
// Editing the shop by hand (name, colours, logo, banner, sections) is "Edit my shop" (/shop-edit).
const SELLER: PeggyScreen[] = [
  { id: "home", name: "Home", app: "/home", web: "/home", also: ["dashboard"] },
  { id: "start", name: "Start here", app: "/start", web: "/home/start", also: ["setup", "checklist", "get set up"], about: "the setup checklist" },
  { id: "shop", name: "My shop", app: "/shop", web: "/studio", also: ["store", "shop"], about: "the shop's page, link and what's in it" },
  {
    id: "look",
    name: "Shop looks",
    app: "/templates",
    web: "/studio",
    also: ["shop look", "store look", "store design", "shop design", "my store design", "design", "templates", "template", "theme", "themes"],
    about: "the store design: pick a template for how the shop looks",
  },
  {
    id: "rex",
    name: "Edit my shop with Rex",
    app: "/rex",
    web: "/studio",
    also: ["rex", "ask rex", "rex store builder", "store builder"],
    about: "chat with Rex to build or change the shop",
  },
  {
    id: "shop_edit",
    name: "Edit my shop",
    app: "/shop-edit",
    web: "/studio",
    also: ["edit my shop", "edit my store", "change my shop", "shop name", "logo", "banner", "colours", "colors", "sections", "publish"],
    about: "change the shop's name, colours, logo, banner and sections by hand, preview and publish",
  },
  { id: "products", name: "Products", app: "/products", web: "/products" },
  { id: "add_product", name: "Add a product", app: "/add-products", web: "/products/new", also: ["new product", "take a photo"] },
  { id: "bulk_add", name: "Add many with Peggy", app: "/bulk-add", web: "/products/bulk", also: ["add many products", "bulk upload", "upload many products", "many photos"], about: "pick many product photos at once, Peggy names them and the seller prices them by chat" },
  { id: "find", name: "Find products to sell", app: "/find", web: "/marketplace", also: ["marketplace", "suppliers", "dropship"] },
  { id: "orders", name: "Orders", app: "/orders", web: "/home/orders" },
  { id: "preorders", name: "Preorders", app: "/preorders", web: "/home/preorders", also: ["preorder", "stock is ready"], about: "preorders from customers and from suppliers" },
  { id: "chats", name: "Chats", app: "/chats", web: "/home/inbox", also: ["messages", "inbox"] },
  { id: "delivery", name: "Delivery", app: "/delivery", web: "/home/shipping", also: ["delivery settings", "shipping"] },
  { id: "delivery_areas", name: "Where you deliver", app: "/delivery/where", web: "/home/shipping", also: ["delivery areas", "coverage", "pickup address"] },
  { id: "delivery_partners", name: "Find a delivery company", app: "/delivery/find", web: "/home/logistics", also: ["delivery partners", "delivery company"] },
  { id: "wallet", name: "Wallet", app: "/wallet", web: "/home/wallet", also: ["money", "bank", "payout", "getting paid"] },
  { id: "payments", name: "Payment methods", app: "/payments", web: "/home/payments", also: ["payments"] },
  { id: "posts", name: "Posts calendar", app: "/posts", web: "/home/social", also: ["posts", "calendar", "social calendar", "scheduled posts"], about: "posts already made and planned, day by day" },
  {
    id: "create",
    name: "Make a post",
    app: "/create",
    web: "/home/media",
    also: ["social post", "make a social post", "new post", "create a post", "create with rex posts", "flyer", "status", "reel"],
    about: "Rex designs a social media post, flyer, status or reel",
  },
  { id: "reviews", name: "Reviews", app: "/reviews", web: "/home/reviews" },
  { id: "customers", name: "Customers", app: "/customers", web: "/home/customers" },
  { id: "domain", name: "Web address", app: "/domain", web: "/home/domain", also: ["domain"] },
  { id: "settings", name: "Settings", app: "/settings", web: "/home/settings" },
  { id: "help", name: "Help", app: "/help", web: "/home/peggy" },
];

const SUPPLIER: PeggyScreen[] = [
  { id: "home", name: "Home", app: "/supplier/home", web: "/supplier/dashboard", also: ["dashboard"] },
  { id: "setup", name: "Set-up", app: "/supplier/setup", web: "/supplier/onboarding", also: ["setup", "business details"] },
  { id: "pickup", name: "Pickup address", app: "/supplier/setup?edit=pickup", web: "/supplier/delivery", also: ["pickup"] },
  { id: "bank", name: "Bank for payments", app: "/supplier/setup?edit=bank", web: "/supplier/wallet", also: ["bank", "payout"] },
  { id: "where", name: "Where you sell", app: "/supplier/setup?edit=where", web: "/supplier/delivery", also: ["coverage", "where i sell"] },
  { id: "products", name: "Products", app: "/supplier/products", web: "/supplier/products" },
  { id: "add_product", name: "Add a product", app: "/supplier/product/new", web: "/supplier/products/new", also: ["new product", "take a photo"] },
  { id: "bulk_add", name: "Add many with Peggy", app: "/bulk-add", web: "/supplier/products/bulk", also: ["add many products", "bulk upload", "upload many products", "many photos"], about: "pick many product photos at once, Peggy names them and the supplier prices them by chat" },
  { id: "orders", name: "Orders", app: "/supplier/orders", web: "/supplier/orders", also: ["dropship orders", "wholesale orders"] },
  { id: "preorders", name: "Preorders", app: "/supplier/preorders", web: "/supplier/preorders", also: ["preorder", "stock is ready"], about: "shops' preorders by product, and Stock is ready" },
  { id: "quotes", name: "Quotes", app: "/supplier/quotes", web: "/supplier/quotes", also: ["quote requests"] },
  { id: "money", name: "Money", app: "/supplier/money", web: "/supplier/payouts", also: ["payments", "earnings"] },
  { id: "wallet", name: "Wallet", app: "/supplier/wallet", web: "/supplier/wallet" },
  { id: "delivery", name: "Delivery", app: "/delivery", web: "/supplier/delivery", also: ["delivery settings"] },
  { id: "verification", name: "Verification", app: "/supplier/verification", web: "/supplier/verification", also: ["documents", "cac"] },
  { id: "messages", name: "Messages", app: "/supplier/messages", web: "/supplier/inbox", also: ["chats", "inbox"] },
  { id: "account", name: "Account", app: "/supplier/account", web: "/supplier/settings", also: ["settings"] },
  { id: "profile", name: "Business profile", app: "/supplier/profile", web: "/supplier/profile", also: ["profile", "logo", "about my business"] },
  { id: "team", name: "Team", app: "/supplier/team", web: "/supplier/team", also: ["staff", "people", "add a person"] },
  { id: "tiers", name: "Wholesale price tiers", app: "/supplier/tiers", web: "/supplier/wholesale", also: ["price tiers", "bulk prices", "wholesale prices"] },
  { id: "agreements", name: "Dropship agreements", app: "/supplier/agreements", web: "/supplier/agreements", also: ["agreements", "sign agreement", "contracts"] },
  { id: "create", name: "Make a post", app: "/create", web: null, also: ["social post", "make a social post", "new post", "flyer"] },
  { id: "posts", name: "Posts calendar", app: "/posts", web: null, also: ["posts", "calendar", "scheduled posts"] },
  { id: "status", name: "Post a status", app: "/status/new", web: null, also: ["status", "new status"] },
  { id: "rewards", name: "Rewards", app: "/rewards", web: null, also: ["points", "refer", "referral"] },
  { id: "help", name: "Help", app: "/help", web: null },
];

const PARTNER: PeggyScreen[] = [
  { id: "home", name: "Home", app: "/logistics/home", web: "/logistics/dashboard", also: ["dashboard"] },
  { id: "setup", name: "Set-up", app: "/logistics/setup", web: "/logistics/onboarding", also: ["setup"] },
  { id: "jobs", name: "Jobs", app: "/logistics/jobs", web: "/logistics/bookings", also: ["bookings", "deliveries"] },
  { id: "coverage", name: "Where you deliver", app: "/logistics/coverage", web: "/logistics/coverage", also: ["coverage", "areas"] },
  { id: "pickup_points", name: "Pickup points", app: "/logistics/points", web: "/logistics/pickup-points", also: ["pickup", "hubs", "offices"] },
  { id: "rates", name: "Rates", app: "/logistics/rates", web: "/logistics/pricing", also: ["prices", "pricing", "rate card"] },
  { id: "riders", name: "Riders", app: "/logistics/team", web: "/logistics/couriers", also: ["team", "couriers"] },
  { id: "add_rider", name: "Add a rider", app: "/logistics/add-rider", web: "/logistics/couriers", also: ["new rider"] },
  { id: "verification", name: "Verification", app: "/logistics/verification", web: "/logistics/verification", also: ["documents", "cac"] },
  { id: "payout", name: "Bank for payments", app: "/logistics/payout", web: "/logistics/payouts", also: ["bank", "payout"] },
  { id: "wallet", name: "Wallet", app: "/logistics/wallet", web: "/logistics/wallet" },
  { id: "earnings", name: "Money", app: "/logistics/earnings", web: "/logistics/wallet", also: ["earnings", "money"] },
  { id: "cash", name: "Cash for sellers", app: "/logistics/cash", web: "/logistics/cash", also: ["pay on delivery cash", "cash owed"] },
  { id: "services", name: "Services", app: "/logistics/services", web: "/logistics/profile" },
  { id: "connections", name: "Sellers you deliver for", app: "/logistics/connections", web: "/logistics/connections", also: ["connections", "sellers"] },
  { id: "messages", name: "Messages", app: "/logistics/messages", web: "/logistics/inbox", also: ["chats", "inbox"] },
  { id: "profile", name: "Company profile", app: "/logistics/profile", web: "/logistics/profile", also: ["profile", "company", "business details"] },
  { id: "quotes", name: "Quote requests", app: "/logistics/quotes", web: "/logistics/quotes", also: ["quotes", "price requests"] },
  { id: "create", name: "Make a post", app: "/create", web: null, also: ["social post", "make a social post", "new post", "flyer"] },
  { id: "posts", name: "Posts calendar", app: "/posts", web: null, also: ["posts", "calendar", "scheduled posts"] },
  { id: "status", name: "Post a status", app: "/status/new", web: null, also: ["status", "new status"] },
  { id: "rewards", name: "Rewards", app: "/rewards", web: null, also: ["points", "refer", "referral"] },
  { id: "help", name: "Help", app: "/help", web: null },
];

export const PEGGY_SCREENS: Record<ScreenRole, readonly PeggyScreen[]> = { seller: SELLER, supplier: SUPPLIER, logistics_partner: PARTNER };

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The screen Peggy asked for (by id, name or another word for it), or null: unknown screens never open. */
export function findScreen(role: ScreenRole, asked: unknown): PeggyScreen | null {
  if (typeof asked !== "string") return null;
  const wanted = key(asked.slice(0, 60));
  if (!wanted) return null;
  const screens = PEGGY_SCREENS[role] ?? [];
  return screens.find((screen) => key(screen.id) === wanted || key(screen.name) === wanted || (screen.also ?? []).some((word) => key(word) === wanted)) ?? null;
}

/** The list Peggy gets in her prompt: "add_product (Add a product), look (Shop looks: the store design: …), …". */
export function screenList(role: ScreenRole) {
  return (PEGGY_SCREENS[role] ?? []).map((screen) => `${screen.id} (${screen.name}${screen.about ? `: ${screen.about}` : ""})`).join(", ");
}

/**
 * Peggy's open_screen on the web call: the allow-listed screen's web path (null when it's phone-only, the role is
 * unknown, or the call page can't move, like the signed-out /call-peggy page), and her answer.
 */
export function openScreenOnWeb(role: ScreenRole | null, params: unknown, canNavigate = true): { screen: PeggyScreen | null; path: string | null; reply: string } {
  const asked = params && typeof params === "object" ? (params as Record<string, unknown>).screen : null;
  const screen = role ? findScreen(role, asked) : null;
  const path = screen && canNavigate ? screen.web : null;
  return { screen, path, reply: openScreenReply(screen, Boolean(path)) };
}

/** The role from the call's {{role}} words ("seller", "supplier", "delivery partner"), for the web call. */
export function screenRoleFromWords(words: unknown): ScreenRole | null {
  if (words === "seller" || words === "supplier") return words;
  if (words === "delivery partner" || words === "logistics_partner") return "logistics_partner";
  return null;
}

/** Peggy's answer after opening a screen (or not), in English. */
export function openScreenReply(screen: PeggyScreen | null, opened: boolean) {
  if (!screen) return "Not opened: that screen isn't on the list. Use one of the screens you were given, or tell them where to tap.";
  if (!opened) return `Not opened: ${screen.name} can't be opened from this call. Tell them where to find it instead.`;
  return `Opened ${screen.name}. Tell them it's open and what to tap there. Don't press anything for them.`;
}
