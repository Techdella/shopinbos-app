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
  /**
   * Pages under this item. The sidebar shows them in a flyout on hover/focus (like Shopify and HubSpot) and
   * inline under the item while you're on one of them, so the top level stays as short as the prototype.
   */
  children?: NavChild[];
  /** Always shown; can't be switched off in "Customise your menu". */
  core?: boolean;
}

export interface NavChild {
  id: string;
  label: string;
  href: string;
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
  // Seller nav is the 2026 "Seller app · web" prototype's list. Everything else is a submenu of the item it belongs to.
  seller: [
    {
      group: "main",
      items: [
        // Shown while setup is unfinished; Start here hides it (preferences.hiddenNav) once done or dismissed.
        { id: "start", label: "Start here", icon: "flag", href: "/home/start" },
        { id: "home", label: "Home", icon: "home", href: "/home", core: true },
        {
          id: "orders", label: "Orders", icon: "package", href: "/home/orders", core: true,
          children: [
            { id: "orders-all", label: "All orders", href: "/home/orders" },
            { id: "orders-new", label: "Record a sale", href: "/home/orders/new" },
            { id: "orders-preorders", label: "Preorders", href: "/home/preorders" },
            { id: "payment-links", label: "Payment links", href: "/home/payment-links" },
          ],
        },
        {
          id: "inbox", label: "Inbox", icon: "chat", href: "/home/messages",
          children: [
            { id: "inbox-messages", label: "All conversations", href: "/home/messages" },
            { id: "inbox-partners", label: "Suppliers and delivery", href: "/home/messages/partners" },
            { id: "inbox-forms", label: "Form messages", href: "/home/forms" },
            { id: "inbox-chat", label: "Live chat", href: "/home/marketing/chat" },
            { id: "inbox-auto-replies", label: "Auto-replies", href: "/home/inbox/auto-replies" },
            { id: "inbox-chatbot", label: "Peggy chatbot", href: "/home/inbox/chatbot" },
            { id: "inbox-whatsapp-store", label: "WhatsApp store", href: "/home/inbox/whatsapp-store" },
            { id: "inbox-whatsapp-catalog", label: "WhatsApp catalog", href: "/home/inbox/whatsapp-catalog" },
            { id: "inbox-notifications", label: "Notifications", href: "/home/notifications" },
          ],
        },
        {
          id: "products", label: "Products", icon: "bag", href: "/products", core: true,
          children: [
            { id: "products-all", label: "All products", href: "/products" },
            { id: "products-new", label: "Add product", href: "/products/new" },
            { id: "products-import", label: "Import", href: "/products/import" },
            { id: "inventory", label: "Inventory", href: "/home/inventory" },
            { id: "collections", label: "Collections", href: "/home/collections" },
            { id: "categories", label: "Categories", href: "/home/categories" },
          ],
        },
      ],
    },
    {
      group: "sourcing",
      label: "Sourcing",
      items: [
        {
          id: "find-products", label: "Find products", icon: "search", href: "/marketplace",
          children: [
            { id: "find-products-all", label: "Products", href: "/marketplace" },
            { id: "find-suppliers", label: "Suppliers", href: "/marketplace/suppliers" },
            { id: "find-logistics", label: "Delivery companies", href: "/marketplace/logistics" },
            { id: "find-wholesale-orders", label: "Wholesale orders", href: "/marketplace/wholesale" },
          ],
        },
        { id: "dropship", label: "Dropship", icon: "box", href: "/home/dropship" },
        { id: "imports", label: "Imports", icon: "truck", href: "/home/imports" },
      ],
    },
    {
      group: "people",
      label: "People",
      items: [
        {
          id: "customers", label: "Customers", icon: "users", href: "/home/customers",
          children: [
            { id: "customers-all", label: "All customers", href: "/home/customers" },
            { id: "subscribers", label: "Subscribers", href: "/home/marketing/subscribers" },
            { id: "segments", label: "Segments", href: "/home/marketing/segments" },
          ],
        },
        { id: "reviews", label: "Reviews", icon: "star", href: "/home/reviews" },
      ],
    },
    {
      group: "store",
      label: "Store",
      items: [
        {
          id: "your-store", label: "Your store", icon: "shop", href: "/home/store",
          children: [
            { id: "editor", label: "Edit your store", href: "/seller/store/builder" },
            { id: "pages", label: "Pages", href: "/home/pages" },
            { id: "navigation", label: "Menus", href: "/home/navigation" },
            { id: "blog", label: "Content", href: "/home/cms" },
            { id: "checkout", label: "Checkout", href: "/home/checkout" },
            { id: "cart", label: "Cart and wishlist", href: "/home/commerce/cart" },
            { id: "seo", label: "SEO", href: "/home/seo" },
            { id: "legal", label: "Legal pages", href: "/home/legal" },
          ],
        },
        {
          id: "rex-studio", label: "Rex Studio", icon: "sparkle", href: "/studio", tag: "AI",
          children: [
            { id: "studio-home", label: "Studio", href: "/studio" },
            { id: "studio-images", label: "Images", href: "/studio/images" },
            { id: "studio-logo", label: "Logo", href: "/studio/logo" },
            { id: "studio-videos", label: "Videos", href: "/home/video" },
            { id: "studio-designs", label: "Flyers and posts", href: "/home/marketing/social/designs" },
            { id: "studio-packaging", label: "Packaging and labels", href: "/home/labels" },
          ],
        },
        { id: "brand-kit", label: "Brand kit", icon: "tag", href: "/home/brand-kit" },
        { id: "media", label: "Media", icon: "image", href: "/home/media" },
        { id: "templates", label: "Templates", icon: "grid", href: "/builder/templates" },
        { id: "domain", label: "Domain", icon: "globe", href: "/home/domain" },
      ],
    },
    {
      group: "marketing",
      label: "Marketing",
      items: [
        {
          id: "marketing", label: "Overview", icon: "chart", href: "/home/marketing",
          children: [
            { id: "marketing-overview", label: "Overview", href: "/home/marketing" },
            { id: "campaigns", label: "Campaigns", href: "/home/marketing/campaigns" },
            { id: "seasonal-campaigns", label: "Seasonal campaigns", href: "/home/campaigns" },
            { id: "automations", label: "Automations", href: "/home/automations" },
            { id: "email-templates", label: "Email templates", href: "/home/marketing/templates" },
            { id: "mkt-forms", label: "Forms and pop-ups", href: "/home/marketing/forms" },
            { id: "mkt-rewards", label: "Rewards and games", href: "/home/marketing/rewards" },
            { id: "marketing-analytics", label: "Marketing reports", href: "/home/marketing/analytics" },
          ],
        },
        {
          id: "social-posts", label: "Social posts", icon: "calendar", href: "/home/marketing/social",
          children: [
            { id: "social-calendar", label: "Calendar", href: "/home/marketing/social" },
            { id: "social-new", label: "Create post", href: "/home/marketing/social/new" },
            { id: "social-designs", label: "Rex designs", href: "/home/marketing/social/designs" },
            { id: "social-accounts", label: "Accounts", href: "/home/marketing/social/accounts" },
          ],
        },
        { id: "ads", label: "Ads", icon: "rocket", href: "/home/ads" },
        { id: "video", label: "Video studio", icon: "play", href: "/home/video", tag: "AI" },
        { id: "discounts", label: "Discounts", icon: "percent", href: "/home/discounts" },
        { id: "affiliates", label: "Affiliates", icon: "link", href: "/home/affiliates" },
        { id: "refer", label: "Refer & earn", icon: "send", href: "/home/refer" },
        { id: "sell-everywhere", label: "Sell everywhere", icon: "globe", href: "/channels" },
        { id: "link-in-bio", label: "Link in bio", icon: "instagram", href: "/home/social/link-in-bio" },
      ],
    },
    {
      group: "run",
      label: "Run",
      items: [
        {
          id: "money", label: "Money", icon: "coin", href: "/home/payments", core: true,
          children: [
            { id: "payments", label: "Payments", href: "/home/payments" },
            { id: "payouts", label: "Payouts", href: "/home/payouts" },
            { id: "wallet", label: "Wallet", href: "/home/wallet" },
            { id: "invoices", label: "Invoices", href: "/home/invoices" },
            { id: "taxes", label: "Taxes", href: "/home/taxes" },
          ],
        },
        {
          id: "delivery", label: "Delivery", icon: "truck", href: "/home/logistics",
          children: [
            { id: "delivery-partners", label: "Delivery partners", href: "/home/logistics" },
            { id: "delivery-my-partners", label: "My delivery partners", href: "/home/logistics/partners" },
            { id: "delivery-exceptions", label: "Delivery exceptions", href: "/home/logistics/exceptions" },
            { id: "delivery-analytics", label: "Delivery analytics", href: "/home/logistics/analytics" },
            { id: "delivery-settings", label: "Delivery settings", href: "/home/logistics/settings" },
            { id: "shipping", label: "Shipping rates", href: "/home/shipping" },
          ],
        },
        {
          id: "labels", label: "Labels and print", icon: "tag", href: "/home/labels",
          children: [
            { id: "labels-designs", label: "Designs and shipping", href: "/home/labels" },
            { id: "labels-packaging", label: "Packaging designer", href: "/home/labels/packaging" },
            { id: "labels-studio", label: "Labels and tags", href: "/home/labels/studio" },
            { id: "labels-orders", label: "Print orders", href: "/home/labels/orders" },
            { id: "labels-request", label: "Custom packaging", href: "/home/labels/request" },
          ],
        },
        {
          id: "reports", label: "Analytics", icon: "chart", href: "/home/analytics",
          children: [
            { id: "reports-sales", label: "Sales and visits", href: "/home/analytics" },
            { id: "reports-traffic", label: "Store traffic", href: "/home/analytics/traffic" },
            { id: "health", label: "Store health", href: "/home/health" },
            { id: "activity", label: "Activity", href: "/home/activity" },
          ],
        },
      ],
    },
    {
      group: "footer",
      pinBottom: true,
      items: [
        {
          id: "settings", label: "Settings", icon: "settings", href: "/home/settings", core: true,
          children: [
            { id: "settings-store", label: "Store settings", href: "/home/settings" },
            { id: "profile", label: "Your profile", href: "/home/profile" },
            { id: "notification-prefs", label: "Notification settings", href: "/home/notifications/preferences" },
            { id: "connections", label: "Connections", href: "/home/connections" },
            { id: "contracts", label: "Contracts", href: "/home/contracts" },
            { id: "customise", label: "Customise your menu", href: "/home/features" },
          ],
        },
      ],
    },
  ],
  supplier: [
    {
      group: "main",
      items: [
        { id: "dashboard", label: "Today", icon: "home", href: "/supplier/dashboard", core: true },
        {
          id: "orders", label: "Orders", icon: "package", href: "/supplier/orders", core: true,
          children: [
            { id: "dropship-orders", label: "Dropship orders", href: "/supplier/orders" },
            { id: "wholesale-orders", label: "Wholesale orders", href: "/supplier/wholesale" },
            { id: "preorders", label: "Preorders", href: "/supplier/preorders" },
          ],
        },
        { id: "quote-requests", label: "Quote requests", icon: "chat", href: "/supplier/quote-requests" },
        { id: "delivery", label: "Delivery", icon: "truck", href: "/supplier/delivery" },
        {
          id: "products", label: "Products", icon: "bag", href: "/supplier/products", core: true,
          children: [
            { id: "products-all", label: "All products", href: "/supplier/products" },
            { id: "products-new", label: "Add product", href: "/supplier/products/new" },
            { id: "products-import", label: "Upload CSV", href: "/supplier/products/import" },
          ],
        },
        { id: "inbox", label: "Inbox", icon: "message", href: "/supplier/inbox" },
      ],
    },
    {
      group: "business",
      label: "Business",
      items: [
        {
          id: "buyers", label: "Buyers", icon: "users", href: "/supplier/buyers",
          children: [
            { id: "buyers-all", label: "Shops selling your products", href: "/supplier/buyers" },
            { id: "agreements", label: "Dropship agreements", href: "/supplier/agreements" },
            { id: "contracts", label: "Contracts", href: "/supplier/contracts" },
            { id: "followers", label: "Followers", href: "/supplier/followers" },
            { id: "reviews", label: "Reviews", href: "/supplier/reviews" },
          ],
        },
        { id: "payouts", label: "Earnings", icon: "bank", href: "/supplier/payouts", core: true },
        { id: "wallet", label: "Wallet", icon: "coin", href: "/supplier/wallet" },
        { id: "analytics", label: "Performance", icon: "chart", href: "/supplier/analytics" },
        { id: "refer", label: "Refer & earn", icon: "send", href: "/supplier/refer" },
      ],
    },
    {
      group: "footer",
      pinBottom: true,
      items: [
        {
          id: "settings", label: "Settings", icon: "settings", href: "/supplier/settings", core: true,
          children: [
            { id: "settings-main", label: "Settings", href: "/supplier/settings" },
            { id: "profile", label: "Company profile", href: "/supplier/profile" },
            { id: "verification", label: "Verification", href: "/supplier/verification" },
            { id: "team", label: "Team", href: "/supplier/team" },
            { id: "customise", label: "Customise your menu", href: "/supplier/features" },
          ],
        },
      ],
    },
  ],
  // Partners nav follows the 2026 "Shopinbos Partners · web dispatch console" prototype.
  logistics_partner: [
    {
      group: "main",
      items: [
        { id: "dashboard", label: "Today", icon: "home", href: "/logistics/dashboard", core: true },
        {
          id: "bookings", label: "Jobs", icon: "box", href: "/logistics/bookings", core: true,
          children: [
            { id: "jobs-all", label: "All jobs", href: "/logistics/bookings" },
            { id: "quotes", label: "Quote requests", href: "/logistics/quotes" },
            { id: "inbox", label: "Inbox", href: "/logistics/inbox" },
          ],
        },
        { id: "couriers", label: "Riders", icon: "truck", href: "/logistics/couriers" },
        { id: "cash", label: "Cash on delivery", icon: "card", href: "/logistics/cash" },
      ],
    },
    {
      group: "business",
      label: "Business",
      items: [
        {
          id: "coverage", label: "Coverage and rates", icon: "pin", href: "/logistics/coverage",
          children: [
            { id: "coverage-areas", label: "Coverage", href: "/logistics/coverage" },
            { id: "rate-card", label: "Rate card", href: "/logistics/rates" },
            { id: "pickup-points", label: "Pickup points", href: "/logistics/pickup-points" },
            { id: "pricing", label: "Rates", href: "/logistics/pricing" },
          ],
        },
        { id: "partner-connections", label: "Connections", icon: "users", href: "/logistics/connections" },
        {
          id: "payouts", label: "Earnings", icon: "chart", href: "/logistics/payouts", core: true,
          children: [
            { id: "earnings", label: "Earnings", href: "/logistics/payouts" },
            { id: "wallet", label: "Wallet", href: "/logistics/wallet" },
            { id: "billing", label: "Fees", href: "/logistics/billing" },
          ],
        },
        {
          id: "analytics", label: "Performance", icon: "star", href: "/logistics/analytics",
          children: [
            { id: "performance", label: "Performance", href: "/logistics/analytics" },
            { id: "reviews", label: "Reviews", href: "/logistics/reviews" },
          ],
        },
        { id: "refer", label: "Refer & earn", icon: "send", href: "/logistics/refer" },
      ],
    },
    {
      group: "setup",
      label: "Setup",
      items: [
        { id: "connect", label: "Connect your system", icon: "link", href: "/logistics/connect" },
        {
          id: "profile", label: "Company", icon: "shop", href: "/logistics/profile", core: true,
          children: [
            { id: "company", label: "Company profile", href: "/logistics/profile" },
            { id: "verification", label: "Verification", href: "/logistics/verification" },
            { id: "contracts", label: "Contracts", href: "/logistics/contracts" },
            { id: "customise", label: "Customise your menu", href: "/logistics/features" },
          ],
        },
      ],
    },
  ],
  admin: [
    {
      group: "main",
      items: [
        { id: "dashboard", label: "Today", icon: "home", href: "/admin/dashboard", core: true },
        {
          id: "support", label: "Inbox", icon: "chat", href: "/admin/support", core: true,
          children: [
            { id: "support-queue", label: "All conversations", href: "/admin/support" },
            { id: "support-new", label: "New conversation", href: "/admin/support/new" },
            { id: "support-templates", label: "WhatsApp templates", href: "/admin/support/templates" },
            { id: "support-macros", label: "Saved replies", href: "/admin/support/macros" },
          ],
        },
        { id: "analytics", label: "Analytics", icon: "chart", href: "/admin/analytics", core: true },
        {
          id: "leads", label: "Leads", icon: "list", href: "/admin/leads", core: true,
          children: [
            { id: "leads-all", label: "All leads", href: "/admin/leads" },
            { id: "lead-campaigns", label: "Campaigns & automations", href: "/admin/lead-campaigns" },
            { id: "lead-whatsapp", label: "WhatsApp", href: "/admin/lead-campaigns/whatsapp" },
            { id: "pilot", label: "Pilot testing", href: "/admin/pilot" },
            { id: "referrals", label: "Referrals", href: "/admin/referrals" },
            { id: "member-tips", label: "Member tips", href: "/admin/member-tips" },
            { id: "member-stories", label: "Member stories", href: "/admin/member-stories" },
          ],
        },
        { id: "product-news", label: "Product news", icon: "megaphone", href: "/admin/product-news", core: true },
        { id: "push", label: "Push center", icon: "bell", href: "/admin/push", core: true },
        { id: "help-videos", label: "Help videos", icon: "play", href: "/admin/help-videos", core: true },
        { id: "updates", label: "Weekly updates", icon: "megaphone", href: "/admin/updates", core: true },
        { id: "ad-requests", label: "Ad requests", icon: "megaphone", href: "/admin/ad-requests", core: true },
        { id: "packaging-requests", label: "Packaging requests", icon: "package", href: "/admin/packaging-requests", core: true },
        { id: "print-orders", label: "Print orders", icon: "truck", href: "/admin/print-orders", core: true },
        { id: "imports", label: "China imports", icon: "globe", href: "/admin/imports", core: true },
      ],
    },
    {
      group: "platform",
      label: "Platform",
      items: [
        { id: "sellers", label: "Sellers", icon: "store", href: "/admin/sellers", core: true },
        {
          id: "suppliers", label: "Suppliers", icon: "users", href: "/admin/suppliers", core: true,
          children: [
            { id: "suppliers-all", label: "Suppliers", href: "/admin/suppliers" },
            { id: "supplier-products", label: "Supplier products", href: "/admin/supplier-products" },
            { id: "supplier-pickups", label: "Pickups waiting for a rider", href: "/admin/supplier-pickups" },
          ],
        },
        {
          id: "logistics-partners", label: "Logistics", icon: "truck", href: "/admin/logistics-partners", core: true,
          children: [
            { id: "logistics-partners-all", label: "Logistics partners", href: "/admin/logistics-partners" },
            { id: "delivery-issues", label: "Delivery problems", href: "/admin/delivery-issues" },
          ],
        },
        { id: "wallets", label: "Wallets", icon: "coin", href: "/admin/wallets" },
        { id: "money-owed", label: "Money owed", icon: "coin", href: "/admin/money-owed" },
        { id: "contracts", label: "Contracts", icon: "document", href: "/admin/contracts" },
        {
          id: "pricing", label: "Pricing", icon: "percent", href: "/admin/pricing",
          children: [
            { id: "pricing-prices", label: "Prices and fees", href: "/admin/pricing" },
            { id: "pricing-promotions", label: "Promotions", href: "/admin/pricing/promotions" },
            { id: "pricing-plans", label: "Subscription plans", href: "/admin/pricing/plans" },
          ],
        },
        {
          id: "marketplace", label: "Marketplace", icon: "monitor", href: "/admin/marketplace",
          children: [
            { id: "marketplace-sync", label: "Marketplace", href: "/admin/marketplace" },
            { id: "categories", label: "Categories", href: "/admin/categories" },
            { id: "domain-partners", label: "Domain partners", href: "/admin/domain-partners" },
            { id: "domain-purchases", label: "Domains sellers bought", href: "/admin/domains" },
          ],
        },
      ],
    },
    {
      group: "footer",
      pinBottom: true,
      items: [
        { id: "team", label: "Team", icon: "users", href: "/admin/team", core: true },
        { id: "launches", label: "Launches", icon: "megaphone", href: "/admin/launches", core: true },
        { id: "developers", label: "Developers", icon: "code", href: "/admin/developers", core: true },
        { id: "errors", label: "App errors", icon: "warn", href: "/admin/errors", core: true },
        { id: "app-release", label: "App updates", icon: "rocket", href: "/admin/app-release", core: true },
        { id: "pilot-features", label: "Pilot features", icon: "sparkle", href: "/admin/features", core: true },
        { id: "settings", label: "Settings", icon: "settings", href: "/admin/settings", core: true },
      ],
    },
  ],
};

/** Every page the nav links to (items and their submenus), for search and titles. */
export function navLinks(role: Role): Array<{ id: string; label: string; href: string; parent?: string }> {
  return NAV_BY_ROLE[role].flatMap((group) =>
    group.items.flatMap((item) => [
      { id: item.id, label: item.label, href: item.href },
      ...(item.children ?? []).map((child) => ({ ...child, parent: item.label })),
    ]),
  );
}

/** Items a person may switch off in "Customise your menu" (everything except core items). */
export function toggleableItems(role: Role) {
  return NAV_BY_ROLE[role].flatMap((group) => group.items.filter((item) => !item.core).map((item) => ({ ...item, group: group.label ?? "" })));
}

export const ROLE_META: Record<
  Role,
  { label: string; icon: "store" | "box" | "truck" | "settings"; tenant: string }
> = {
  seller:           { label: "Seller",           icon: "store",    tenant: "Your Store" },
  supplier:         { label: "Supplier",          icon: "box",      tenant: "Your Company" },
  logistics_partner:{ label: "Logistics Partner", icon: "truck",    tenant: "Your Fleet" },
  admin:            { label: "Admin",             icon: "settings", tenant: "shopinbos / ops" },
};
