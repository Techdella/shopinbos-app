export type Role = "seller" | "supplier" | "logistics_partner" | "admin";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: string;
  accent?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  group: string;
  label?: string;
  items: NavItem[];
}

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  seller: [
    {
      group: "website",
      label: "Store",
      items: [
        { id: "home",       label: "Dashboard",   icon: "home",     href: "/home" },
        { id: "pages",      label: "Pages",       icon: "document", href: "/home/pages" },
        { id: "blog",       label: "Blog",        icon: "edit",     href: "/home/cms" },
        { id: "theme",      label: "Theme & Brand", icon: "palette", href: "/seller/store/builder" },
        { id: "domain",     label: "Domain",      icon: "monitor",  href: "/home/domain" },
      ],
    },
    {
      group: "catalog",
      label: "Catalog",
      items: [
        { id: "products",    label: "Products",    icon: "box",     href: "/products" },
        { id: "categories",  label: "Categories",  icon: "grid",    href: "/home/categories" },
        { id: "collections", label: "Collections", icon: "layers",  href: "/home/collections" },
      ],
    },
    {
      group: "commerce",
      label: "Commerce",
      items: [
        { id: "orders",      label: "Orders",      icon: "cart",    href: "/home/orders" },
        { id: "customers",   label: "Customers",   icon: "users",   href: "/home/customers" },
        { id: "inventory",   label: "Inventory",   icon: "box",     href: "/home/inventory" },
        { id: "reviews",     label: "Reviews",     icon: "star",    href: "/home/reviews" },
      ],
    },
    {
      group: "operations",
      label: "Operations",
      items: [
        { id: "logistics",   label: "Logistics",    icon: "truck",      href: "/home/logistics" },
        { id: "messages",    label: "Messages",     icon: "message",    href: "/home/messages" },
        { id: "invoices",    label: "Invoices",     icon: "document",   href: "/home/invoices" },
      ],
    },
    {
      group: "marketing",
      label: "Marketing",
      items: [
        { id: "campaigns",   label: "Campaigns",    icon: "megaphone",  href: "/home/marketing/campaigns" },
        { id: "analytics",   label: "Analytics",    icon: "chart",      href: "/home/marketing/analytics" },
        { id: "subscribers", label: "Subscribers",  icon: "users",      href: "/home/marketing/subscribers" },
        { id: "mkt-forms",   label: "Forms & Popups", icon: "mail",     href: "/home/marketing/forms" },
        { id: "chat",        label: "Live Chat",    icon: "message",    href: "/home/marketing/chat" },
      ],
    },
    {
      group: "settings",
      label: "Settings",
      items: [
        { id: "navigation",  label: "Navigation",   icon: "list",      href: "/home/navigation" },
        { id: "seo",         label: "SEO",          icon: "chart",     href: "/home/seo" },
        { id: "payments",    label: "Payments",     icon: "coin",      href: "/home/payments" },
        { id: "shipping",    label: "Delivery",     icon: "truck",     href: "/home/shipping" },
        { id: "taxes",       label: "Taxes",        icon: "percent",   href: "/home/taxes" },
        { id: "legal",       label: "Legal Pages",  icon: "document",  href: "/home/legal" },
        { id: "settings",    label: "General",      icon: "settings",  href: "/home/settings" },
      ],
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
