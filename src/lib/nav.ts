import type { IconName } from "@/components/ui/Icon";

export type Role = "seller" | "supplier" | "logistics_partner" | "admin";

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  badge?: string;
  /** Small label after the name, e.g. "AI" or "Web". */
  tag?: string;
  accent?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  group: string;
  label?: string;
  /** Starts collapsed unless the current page is inside it. */
  collapsible?: boolean;
  /** Pushed to the bottom of the sidebar. */
  pinBottom?: boolean;
  items: NavItem[];
}

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  // Seller nav follows the 2026 "Seller app · web" mockup. Existing pages the mockup doesn't show live under
  // "More tools" (Campaigns stays under Marketing: it's where broadcasts are sent).
  seller: [
    {
      group: "main",
      items: [
        { id: "home",     label: "Home",     icon: "home",    href: "/home" },
        { id: "orders",   label: "Orders",   icon: "package", href: "/home/orders" },
        { id: "inbox",    label: "Inbox",    icon: "chat",    href: "/home/messages" },
        { id: "products", label: "Products", icon: "bag",     href: "/products" },
      ],
    },
    {
      group: "sourcing",
      label: "Sourcing",
      items: [
        { id: "find-products", label: "Find products", icon: "search", href: "/marketplace" },
        { id: "imports",       label: "Imports",       icon: "truck",  href: "/home/dropship" },
      ],
    },
    {
      group: "people",
      label: "People",
      items: [
        { id: "customers", label: "Customers", icon: "users", href: "/home/customers" },
        { id: "reviews",   label: "Reviews",   icon: "star",  href: "/home/reviews" },
      ],
    },
    {
      group: "store",
      label: "Store",
      items: [
        { id: "your-store", label: "Your store",       icon: "shop",    href: "/home/editor" },
        { id: "rex-studio", label: "Rex Studio",       icon: "sparkle", href: "/studio", tag: "AI" },
        { id: "brand-kit",  label: "Brand kit",        icon: "tag",     href: "/home/brand-kit" },
        { id: "templates",  label: "Templates",        icon: "grid",    href: "/builder/templates" },
        { id: "domain",     label: "Domain",           icon: "globe",   href: "/home/domain" },
        { id: "builder",    label: "Advanced builder", icon: "monitor", href: "/seller/store/builder", tag: "Web" },
      ],
    },
    {
      group: "marketing",
      label: "Marketing",
      items: [
        { id: "marketing",       label: "Overview",        icon: "chart",     href: "/home/marketing" },
        { id: "ads",             label: "Ads",             icon: "rocket",    href: "/home/ads" },
        { id: "video",           label: "Video studio",    icon: "play",      href: "/home/video", tag: "AI" },
        { id: "discounts",       label: "Discounts",       icon: "percent",   href: "/home/discounts" },
        { id: "affiliates",      label: "Affiliates",      icon: "link",      href: "/home/affiliates" },
        { id: "campaigns",       label: "Campaigns",       icon: "megaphone", href: "/home/marketing/campaigns" },
        { id: "sell-everywhere", label: "Sell everywhere", icon: "globe",     href: "/home/social" },
      ],
    },
    {
      group: "run",
      label: "Run",
      items: [
        { id: "money",    label: "Money",    icon: "coin",  href: "/home/payments" },
        { id: "delivery", label: "Delivery", icon: "truck", href: "/home/logistics" },
        { id: "labels",   label: "Labels and print", icon: "tag", href: "/home/labels" },
        { id: "reports",  label: "Reports",  icon: "chart", href: "/home/insights" },
      ],
    },
    {
      group: "more",
      label: "More tools",
      collapsible: true,
      items: [
        { id: "inventory",   label: "Inventory",      icon: "box",       href: "/home/inventory" },
        { id: "categories",  label: "Categories",     icon: "grid",      href: "/home/categories" },
        { id: "collections", label: "Collections",    icon: "layers",    href: "/home/collections" },
        { id: "pages",       label: "Pages",          icon: "document",  href: "/home/pages" },
        { id: "blog",        label: "Blog",           icon: "edit",      href: "/home/cms" },
        { id: "navigation",  label: "Navigation",     icon: "list",      href: "/home/navigation" },
        { id: "subscribers", label: "Subscribers",    icon: "users",     href: "/home/marketing/subscribers" },
        { id: "mkt-forms",   label: "Forms & popups", icon: "mail",      href: "/home/marketing/forms" },
        { id: "chat",        label: "Live chat",      icon: "message",   href: "/home/marketing/chat" },
        { id: "invoices",    label: "Invoices",       icon: "document",  href: "/home/invoices" },
        { id: "shipping",    label: "Shipping rates", icon: "truck",     href: "/home/shipping" },
        { id: "taxes",       label: "Taxes",          icon: "percent",   href: "/home/taxes" },
        { id: "seo",         label: "SEO",            icon: "search",    href: "/home/seo" },
        { id: "legal",       label: "Legal pages",    icon: "document",  href: "/home/legal" },
      ],
    },
    {
      group: "footer",
      pinBottom: true,
      items: [{ id: "settings", label: "Settings", icon: "settings", href: "/home/settings" }],
    },
  ],
  supplier: [
    {
      group: "main",
      items: [
        { id: "dashboard",        label: "Dashboard",        icon: "home",    href: "/supplier/dashboard" },
        { id: "products",         label: "My products",      icon: "box",     href: "/supplier/products" },
        { id: "dropship-orders",  label: "Dropship orders",  icon: "package", href: "/supplier/orders" },
        { id: "wholesale-orders", label: "Wholesale orders", icon: "truck",   href: "/supplier/wholesale" },
        { id: "quote-requests",   label: "Quote requests",   icon: "chat",    href: "/supplier/quote-requests" },
        { id: "inbox",            label: "Inbox",            icon: "message", href: "/supplier/inbox" },
        { id: "buyers",           label: "Buyers",           icon: "users",   href: "/supplier/buyers" },
        { id: "reviews",          label: "Reviews",          icon: "star",    href: "/supplier/reviews" },
      ],
    },
    {
      group: "manage",
      label: "Manage",
      items: [
        { id: "profile",      label: "Supplier profile", icon: "shop",      href: "/supplier/profile" },
        { id: "verification", label: "Verification",     icon: "check",     href: "/supplier/verification" },
        { id: "analytics",    label: "Analytics",        icon: "chart",     href: "/supplier/analytics" },
        { id: "team",         label: "Team",             icon: "users",     href: "/supplier/team" },
        { id: "payouts",      label: "Payouts",          icon: "bank",      href: "/supplier/payouts" },
        { id: "settings",     label: "Settings",         icon: "settings",  href: "/supplier/settings" },
      ],
    },
  ],
  logistics_partner: [
    {
      group: "main",
      items: [
        { id: "dashboard", label: "Dashboard",       icon: "home",  href: "/logistics/dashboard" },
        { id: "inbox",     label: "Inbox",            icon: "message", href: "/logistics/inbox" },
        { id: "bookings",  label: "Bookings",        icon: "truck", href: "/logistics/bookings" },
        { id: "reviews",   label: "Reviews",          icon: "star",  href: "/logistics/reviews" },
        { id: "quotes",    label: "Quote requests",  icon: "chat",  href: "/logistics/quotes" },
        { id: "couriers",  label: "Couriers",        icon: "users", href: "/logistics/couriers" },
        { id: "coverage",  label: "Coverage map",    icon: "pin",   href: "/logistics/coverage" },
        { id: "pricing",   label: "Pricing",         icon: "coin",  href: "/logistics/pricing" },
      ],
    },
    {
      group: "manage",
      label: "Manage",
      items: [
        { id: "profile",   label: "Company profile", icon: "shop",     href: "/logistics/profile" },
        { id: "billing",   label: "Billing",         icon: "document",  href: "/logistics/billing" },
        { id: "analytics", label: "Analytics",       icon: "chart",    href: "/logistics/analytics" },
        { id: "payouts",   label: "Payouts",         icon: "bank",     href: "/logistics/payouts" },
        { id: "settings",  label: "Settings",        icon: "settings", href: "/logistics/settings" },
      ],
    },
  ],
  admin: [
    {
      group: "main",
      items: [
        { id: "dashboard", label: "Today", icon: "home", href: "/admin/dashboard" },
      ],
    },
    {
      group: "platform",
      label: "Platform",
      items: [
        { id: "suppliers",          label: "Suppliers",   icon: "users",   href: "/admin/suppliers" },
        { id: "supplier-products",  label: "Products",    icon: "bag",     href: "/admin/supplier-products" },
        { id: "logistics-partners", label: "Logistics",   icon: "truck",   href: "/admin/logistics-partners" },
        { id: "categories",         label: "Categories",  icon: "box",     href: "/admin/categories" },
        { id: "marketplace",        label: "Marketplace", icon: "monitor", href: "/admin/marketplace" },
      ],
    },
    {
      group: "meta",
      label: "Meta",
      items: [
        { id: "domain-partners", label: "Domain Partners", icon: "globe", href: "/admin/domain-partners" },
        { id: "settings", label: "Settings", icon: "settings", href: "/admin/settings" },
      ],
    },
  ],
};

export const ROLE_META: Record<
  Role,
  { label: string; icon: "store" | "box" | "truck" | "settings"; tenant: string }
> = {
  seller:           { label: "Seller",           icon: "store",    tenant: "Your Store" },
  supplier:         { label: "Supplier",          icon: "box",      tenant: "Your Company" },
  logistics_partner:{ label: "Logistics Partner", icon: "truck",    tenant: "Your Fleet" },
  admin:            { label: "Admin",             icon: "settings", tenant: "shopinbos / ops" },
};
