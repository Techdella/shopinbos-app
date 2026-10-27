// The admin team: who can open which part of the admin portal. Pure, unit-tested in tests/admin-team.test.mjs.
//
// Every admin account has an admin role (User.adminRole). Existing admins with none are owners. Each role opens a
// set of sections, and each section is a list of /admin pages and /api/admin routes. src/proxy.ts checks pages,
// src/lib/auth/middleware.ts checks the API, and the sidebar hides what a role can't open. Owners manage the team.

export const ADMIN_ROLES = ["owner", "admin", "support", "growth", "operations", "finance", "developer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** A removed team member: signed out and kept out until an owner adds them back. */
export const DISABLED_ADMIN_ROLE = "disabled";

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support: "Support",
  growth: "Growth",
  operations: "Operations",
  finance: "Finance",
  developer: "Developer",
};

export const ADMIN_ROLE_HELP: Record<AdminRole, string> = {
  owner: "Everything, and adds or removes team members.",
  admin: "Everything except the team.",
  support: "The inbox (email, WhatsApp and app chats) and leads.",
  growth: "Inbox, leads, campaigns, WhatsApp, analytics, product news, the push center, help videos and requests.",
  operations: "Inbox, suppliers, logistics, catalog, marketplace, orders and requests.",
  finance: "Wallets, money owed, pricing and analytics.",
  developer: "The Developers and App errors pages: delivery partners' software connections, API docs, service setup and errors people hit.",
};

export type AdminSection = "today" | "inbox" | "leads" | "analytics" | "content" | "requests" | "partners" | "money" | "settings" | "team" | "developers";

const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  owner: ["today", "inbox", "leads", "analytics", "content", "requests", "partners", "money", "settings", "team", "developers"],
  admin: ["today", "inbox", "leads", "analytics", "content", "requests", "partners", "money", "settings", "developers"],
  support: ["today", "inbox", "leads", "settings"],
  growth: ["today", "inbox", "leads", "analytics", "content", "requests", "settings"],
  operations: ["today", "inbox", "partners", "requests", "settings"],
  finance: ["today", "money", "analytics", "settings"],
  developer: ["today", "settings", "developers"],
};

// First path segment after /admin (or /api/admin) → section. Anything not listed is for owners and admins only.
// Settings is everyone's own profile, sign-in security and language.
const SEGMENT_SECTION: Record<string, AdminSection> = {
  "": "today",
  dashboard: "today",
  users: "today",
  support: "inbox",
  leads: "leads",
  "lead-campaigns": "leads",
  "website-leads": "leads",
  referrals: "leads",
  "member-tips": "leads",
  "member-stories": "leads",
  analytics: "analytics",
  "product-news": "content",
  push: "content",
  "help-videos": "content",
  updates: "content",
  "ad-requests": "requests",
  "packaging-requests": "requests",
  "print-orders": "requests",
  sellers: "partners",
  suppliers: "partners",
  "supplier-products": "partners",
  "supplier-pickups": "partners",
  logistics: "partners",
  "logistics-partners": "partners",
  "delivery-issues": "partners",
  catalog: "partners",
  categories: "partners",
  marketplace: "partners",
  orders: "partners",
  "domain-partners": "partners",
  domains: "partners",
  "ai-check": "developers",
  wallets: "money",
  "money-owed": "money",
  pricing: "money",
  settings: "settings",
  team: "team",
  developers: "developers",
  errors: "developers",
};

// Nav item id (src/lib/nav.ts) → section, for the sidebar.
const NAV_SECTION: Record<string, AdminSection> = {
  dashboard: "today",
  support: "inbox",
  analytics: "analytics",
  leads: "leads",
  referrals: "leads",
  "member-tips": "leads",
  "member-stories": "leads",
  "product-news": "content",
  push: "content",
  "help-videos": "content",
  updates: "content",
  "ad-requests": "requests",
  "packaging-requests": "requests",
  "print-orders": "requests",
  sellers: "partners",
  suppliers: "partners",
  "logistics-partners": "partners",
  marketplace: "partners",
  wallets: "money",
  "money-owed": "money",
  pricing: "money",
  settings: "settings",
  team: "team",
  developers: "developers",
  errors: "developers",
};

/** The stored value as a role: unknown or empty means owner (admins from before roles existed). */
export function asAdminRole(value: string | null | undefined): AdminRole | typeof DISABLED_ADMIN_ROLE {
  if (value === DISABLED_ADMIN_ROLE) return DISABLED_ADMIN_ROLE;
  return (ADMIN_ROLES as readonly string[]).includes(value ?? "") ? (value as AdminRole) : "owner";
}

export function adminSections(role: string | null | undefined): AdminSection[] {
  const parsed = asAdminRole(role);
  return parsed === DISABLED_ADMIN_ROLE ? [] : ROLE_SECTIONS[parsed];
}

export function canUseSection(role: string | null | undefined, section: AdminSection) {
  return adminSections(role).includes(section);
}

/** The section an /admin page or /api/admin route belongs to, or null for paths outside the admin portal. */
export function sectionForPath(pathname: string): AdminSection | "restricted" | null {
  const match = /^\/(?:api\/)?admin(?:\/([^/?#]*))?(?:[/?#]|$)/.exec(pathname);
  if (!match) return null;
  const segment = (match[1] ?? "").toLowerCase();
  if (segment === "login") return null;
  return SEGMENT_SECTION[segment] ?? "restricted";
}

/** Can this admin role open the page or API route? "restricted" paths are for owners and admins. */
export function adminCanOpen(role: string | null | undefined, pathname: string) {
  const section = sectionForPath(pathname);
  if (section === null) return true;
  if (section === "restricted") return isFullAdmin(role);
  return adminSections(role).includes(section);
}

/** Owners and admins: every section. */
export function isFullAdmin(role: string | null | undefined) {
  const parsed = asAdminRole(role);
  return parsed === "owner" || parsed === "admin";
}

/** Sidebar item ids this role sees (null: everything, for owners). */
export function adminNavIds(role: string | null | undefined): string[] | null {
  const parsed = asAdminRole(role);
  if (parsed === "owner") return null;
  const sections = adminSections(parsed);
  return Object.entries(NAV_SECTION)
    .filter(([, section]) => sections.includes(section))
    .map(([id]) => id);
}

/** Where a role lands after sign-in or when it opens a page it can't use. */
export function adminHome(role: string | null | undefined) {
  return adminSections(role).includes("today") ? "/admin/dashboard" : "/admin/login";
}
