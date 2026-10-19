import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  ProductDetailsSchema,
  ProductTypeSchema,
  RelatedProductIdsSchema,
  VariantOptionsSchema,
  VariantRowSchema,
  VariantRowsSchema,
} from "../../../shared/product-variants-schema.ts";

// Request bodies come from JSON, so free-form objects are valid Prisma Json input.
const jsonObject = () => z.record(z.string(), z.unknown()) as unknown as z.ZodType<Prisma.InputJsonObject>;

// ─── Enums ────────────────────────────────────────────────────────────────────

export const RoleSchema = z.enum(["seller", "supplier", "logistics_partner", "admin"]);
export const VerificationStatusSchema = z.enum(["unverified", "pending", "verified", "rejected", "suspended"]);
export const BusinessTypeSchema = z.enum(["manufacturer", "wholesaler", "importer", "dropshipper"]);
export const ProductStatusSchema = z.enum(["draft", "pending_review", "published", "unpublished", "rejected"]);
export const FulfillmentTypeSchema = z.enum(["merchant_fulfilled", "dropship", "wholesale_stocked"]);
export const OrderStatusSchema = z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]);
export const QuoteStatusSchema = z.enum(["pending", "responded", "accepted", "rejected", "expired"]);
export const BookingStatusSchema = z.enum(["pending", "confirmed", "picked_up", "in_transit", "delivered", "failed", "cancelled"]);

// ─── New Commerce Enums ──────────────────────────────────────────────────────────

export const ProductVisibilitySchema = z.enum(["hidden", "storefront", "featured", "collection_only"]);
export const SalesChannelSchema = z.enum(["website", "instagram", "whatsapp", "marketplace", "all"]);
export const InventoryTypeSchema = z.enum(["seller", "dropshipping", "source_on_demand", "print_on_demand", "digital"]);
export const ProductSourceTypeSchema = z.enum(["imported", "local", "supplier", "dropship", "seller", "manufactured", "digital"]);
export const ShippingTypeSchema = z.enum(["flat_rate", "weight_based", "zone_based", "free_shipping", "conditional", "distance_based", "hybrid"]);
export const CheckoutLayoutSchema = z.enum(["single_page", "multi_step", "accordion", "minimal", "express", "mobile"]);
export const ProductPageVariantSchema = z.enum(["shopify", "amazon", "luxury", "minimal", "marketplace", "fashion", "mobile_first"]);
export const RetailOrderStatusSchema = z.enum(["pending", "awaiting_payment", "paid", "processing", "packed", "shipped", "delivered", "returned", "cancelled", "refunded", "partially_refunded"]);

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SortSchema = z.enum(["trending", "newest", "margin", "price_low", "price_high", "moq_low"]).default("trending");
export const SupplierSortSchema = z.enum(["trust_score", "rating", "newest", "name"]).default("trust_score");
export const LogisticsSortSchema = z.enum(["reliability", "rating", "newest", "price_low", "price_high"]).default("reliability");

// ─── Category ─────────────────────────────────────────────────────────────────

export const CategoryCreateSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const CategorySchema = CategoryCreateSchema.extend({
  id: z.string(),
  createdAt: z.coerce.date(),
});

// ─── Supplier ─────────────────────────────────────────────────────────────────

export const SupplierCreateSchema = z.object({
  businessName: z.string().min(2).max(120),
  displayName: z.string().min(2).max(120),
  businessType: BusinessTypeSchema,
  country: z.string().min(2).max(60),
  city: z.string().min(2).max(60),
  address: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  categories: z.array(z.string()).min(1),
  whatsappNumber: z.string().max(20).optional(),
  website: z.string().url().optional(),
});

export const SupplierUpdateSchema = SupplierCreateSchema.partial();

export const SupplierOnboardingDocumentSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(2).max(120),
  type: z.enum(["registration", "tax", "bank", "identity", "factory", "other"]).default("other"),
  fileName: z.string().min(1).max(180).optional(),
  status: z.enum(["pending", "uploaded", "reading", "read", "optional"]).default("pending"),
  notes: z.string().max(500).optional(),
  uploadedAt: z.string().datetime().optional(),
});

export const SupplierOnboardingSchema = z.object({
  businessName: z.string().min(2).max(120).optional(),
  displayName: z.string().min(2).max(120).optional(),
  country: z.string().min(2).max(60).optional(),
  city: z.string().min(2).max(60).optional(),
  address: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  categories: z.array(z.string().min(1).max(80)).max(12).optional(),
  documents: z.array(SupplierOnboardingDocumentSchema).max(12).default([]),
  documentFindings: z.record(z.string(), z.string().max(500)).default({}),
  readinessScore: z.number().int().min(0).max(100).default(0),
  completed: z.boolean().default(false),
  /** "I'll add my documents later": opens the portal (unverified) instead of submitting. */
  docsLater: z.boolean().optional(),
});

export const SupplierSchema = SupplierCreateSchema.extend({
  id: z.string(),
  slug: z.string(),
  userId: z.string(),
  verificationStatus: VerificationStatusSchema,
  trustScore: z.number().int(),
  rating: z.number(),
  ratingCount: z.number().int(),
  responseTimeLabel: z.string().optional().nullable(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Supplier Product ─────────────────────────────────────────────────────────

export const PricingTierSchema = z.object({
  minQty: z.number().int().min(1),
  maxQty: z.number().int().optional(),
  price: z.number().positive(),
});

export const SupplierProductCreateSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10).max(5000),
  categoryId: z.string(),
  images: z.array(z.string().url()).min(1).max(10),
  wholesalePrice: z.number().positive(),
  wholesalePriceTo: z.number().positive().optional(),
  suggestedRetailPrice: z.number().positive(),
  currency: z.string().length(3).default("NGN"),
  moq: z.number().int().min(1).default(1),
  stockQuantity: z.number().int().min(0).default(0),
  pricingTiers: z.array(PricingTierSchema).default([]),
  dropshipAvailable: z.boolean().default(false),
  bulkOrderAvailable: z.boolean().default(true),
  sampleAvailable: z.boolean().default(false),
  deliveryRegions: z.array(z.string()),
  processingTime: z.string().max(80).optional(),
  status: ProductStatusSchema.default("draft"),
});

export const SupplierProductUpdateSchema = SupplierProductCreateSchema.partial();

export const SupplierProductSchema = SupplierProductCreateSchema.extend({
  id: z.string(),
  slug: z.string(),
  supplierId: z.string(),
  trendScore: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Store ────────────────────────────────────────────────────────────────────

export const StoreCreateSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  country: z.string().min(2).max(60),
  city: z.string().max(60).optional(),
  currency: z.string().length(3).default("NGN"),
  brandSettings: jsonObject().default({}),
  customDomain: z.string().max(120).optional(),
});

export const StoreUpdateSchema = StoreCreateSchema.partial().omit({ slug: true });

export const StoreSchema = StoreCreateSchema.extend({
  id: z.string(),
  userId: z.string(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Store Product ────────────────────────────────────────────────────────────

// One version (variant) of a product: options such as Size and Colour, its own price, stock, photo and on/off.
// Older rows ({ name, color, size, price, stock }) are still accepted. See shared/product-variants.ts.
export const ProductVariantSchema = VariantRowSchema;

export const StoreProductCreateSchema = z.object({
  supplierProductId: z.string().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  longDescription: z.string().max(20000).optional(),
  specifications: z.array(z.object({
    name: z.string().min(1).max(100),
    value: z.string().min(1).max(500),
  })).default([]),
  faqs: z.array(z.object({
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(2000),
  })).default([]),
  careInstructions: z.string().max(5000).optional(),
  shippingInfo: z.string().max(5000).optional(),
  returnPolicy: z.string().max(5000).optional(),
  warranty: z.string().max(5000).optional(),
  supportInfo: z.string().max(5000).optional(),
  sku: z.string().max(60).optional(),
  barcode: z.string().max(60).optional(),
  images: z.array(z.string()).default([]),
  videoUrl: z.string().url().optional().or(z.literal("")),
  has360View: z.boolean().default(false),
  retailPrice: z.number().positive(),
  costPrice: z.number().positive().optional(),
  compareAtPrice: z.number().positive().optional(),
  currency: z.string().length(3).default("NGN"),
  weight: z.number().positive().optional(),
  weightUnit: z.string().default("kg"),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.string().default("cm"),
  }).optional(),
  fulfillmentType: FulfillmentTypeSchema.default("merchant_fulfilled"),
  // Storefronts and checkout only sell "published" products; "active" (what older forms sent for "Live") means the same.
  status: z.string().default("draft").transform((value) => (value === "active" ? "published" : value)),
  visibility: ProductVisibilitySchema.default("hidden"),
  salesChannel: SalesChannelSchema.default("website"),
  inventoryType: InventoryTypeSchema.default("seller"),
  sourceType: ProductSourceTypeSchema.optional(),
  categoryId: z.string().optional(),
  variants: VariantRowsSchema.default([]),
  // Product type (preset category), its details, the options for the versions and "Customers also like".
  productType: ProductTypeSchema.nullable().optional(),
  productDetails: ProductDetailsSchema.optional(),
  variantOptions: VariantOptionsSchema.optional(),
  relatedProductIds: RelatedProductIdsSchema.optional(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  // Inventory
  currentStock: z.number().int().min(0).default(0),
  reservedStock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(10),
  // "Track stock" (shared/product-stock.ts). Left out on create: on when a count above 0 (or per-version counts) is
  // given; left out on edit: switched on when a count above 0 is sent (see stockTrackingFor).
  trackStock: z.boolean().optional(),
  continueSellingWhenOut: z.boolean().optional(),
  // Page builder
  pageVariant: ProductPageVariantSchema.default("shopify"),
  pageLayout: jsonObject().default({}),
  descriptionBuilder: jsonObject().default({}),
  enabledModules: z.array(z.string()).default([]),
  // SEO & marketing
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  marketingCopy: z.string().max(5000).optional(),
  socialMediaCopy: z.string().max(2000).optional(),
});

// On an edit, `compareAtPrice: null` takes the crossed-out "was" price off (the phone's product editor sends it).
export const StoreProductUpdateSchema = StoreProductCreateSchema.partial().extend({
  compareAtPrice: z.number().positive().nullable().optional(),
  // The phone's product editor changes price, stock or on/off of existing versions by id.
  variantUpdates: z
    .array(z.object({
      id: z.string().min(1).max(80),
      price: z.number().min(0).max(100_000_000).nullable().optional(),
      stock: z.number().int().min(0).max(10_000_000).nullable().optional(),
      enabled: z.boolean().optional(),
    }))
    .max(100)
    .optional(),
});

export const InventoryUpdateSchema = z.object({
  currentStock: z.number().int().min(0),
  reservedStock: z.number().int().min(0).optional(),
  incomingStock: z.number().int().min(0).optional(),
  damagedStock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  // Left out: switched on when a count above 0 is set (setting a count means counting it).
  trackStock: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

export const StockMovementCreateSchema = z.object({
  productId: z.string(),
  change: z.number().int(),
  type: z.enum(["addition", "removal", "adjustment", "return", "damaged"]),
  note: z.string().max(500).default(""),
});

export const AddFromSupplierSchema = z.object({
  supplierProductId: z.string(),
  retailPrice: z.number().positive(),
  fulfillmentType: z.enum(["dropship", "wholesale_stocked"]),
  visibility: ProductVisibilitySchema.default("hidden"),
  inventoryType: InventoryTypeSchema.default("dropshipping"),
});

// ─── Collection ─────────────────────────────────────────────────────────────────

export const CollectionCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  type: z.enum(["manual", "auto"]).default("manual"),
  rules: jsonObject().default({}),
  sortOrder: z.number().int().default(0),
  productIds: z.array(z.string().min(1).max(64)).max(500).default([]),
});

export const CollectionUpdateSchema = CollectionCreateSchema.partial();

export const CollectionSchema = CollectionCreateSchema.extend({
  id: z.string(),
  storeId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CollectionProductSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  productId: z.string(),
  sortOrder: z.number().int(),
});

// ─── Shipping Zone ─────────────────────────────────────────────────────────────

export const ShippingRateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  minValue: z.number().min(0).default(0),
  maxValue: z.number().min(0).optional(),
  minWeight: z.number().min(0).default(0),
  maxWeight: z.number().min(0).optional(),
  price: z.number().min(0),
  estimatedDays: z.string().max(40).optional(),
  // Marks rates written by onboarding so re-running it replaces its own zones only.
  source: z.string().max(40).optional(),
});

export const ShippingZoneCreateSchema = z.object({
  name: z.string().min(1).max(120),
  type: ShippingTypeSchema.default("flat_rate"),
  // Empty regions = catch-all zone that matches every address (as onboarding's "other states" zone does).
  regions: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  rates: z.array(ShippingRateSchema).default([]),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

// No defaults here: Zod 4 applies defaults inside .partial(), so a PATCH of one field would reset the others.
export const ShippingZoneUpdateSchema = z.object({
  name: z.string().min(1).max(120),
  type: ShippingTypeSchema,
  regions: z.array(z.string().trim().min(1).max(80)).max(200),
  rates: z.array(ShippingRateSchema),
  sortOrder: z.number().int(),
  active: z.boolean(),
}).partial();

export const ShippingZoneSchema = ShippingZoneCreateSchema.extend({
  id: z.string(),
  storeId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Checkout Config ───────────────────────────────────────────────────────────

export const CheckoutConfigCreateSchema = z.object({
  layout: CheckoutLayoutSchema.default("multi_step"),
  enabledModules: z.array(z.string()).default(["customer_details", "shipping_address", "delivery_method", "payment_method", "order_summary"]),
  moduleOrder: z.array(z.string()).default(["customer_details", "shipping_address", "delivery_method", "coupon", "order_notes", "payment_method", "order_summary"]),
  requirePhone: z.boolean().default(false),
  enableNotes: z.boolean().default(true),
  enableGiftNote: z.boolean().default(false),
  enableCoupon: z.boolean().default(true),
  enableUpsells: z.boolean().default(false),
  enableTrustBadges: z.boolean().default(true),
  upsellProducts: z.array(z.string()).default([]),
});

export const CheckoutConfigUpdateSchema = CheckoutConfigCreateSchema.partial();

export const CheckoutConfigSchema = CheckoutConfigCreateSchema.extend({
  id: z.string(),
  storeId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Product Page Template ─────────────────────────────────────────────────────

export const ProductPageTemplateCreateSchema = z.object({
  name: z.string().min(1).max(120),
  variant: ProductPageVariantSchema.default("shopify"),
  config: jsonObject().default({}),
  isDefault: z.boolean().default(false),
});

export const ProductPageTemplateUpdateSchema = ProductPageTemplateCreateSchema.partial();

export const ProductPageTemplateSchema = ProductPageTemplateCreateSchema.extend({
  id: z.string(),
  storeId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Product Source ────────────────────────────────────────────────────────────

export const ProductSourceCreateSchema = z.object({
  productId: z.string(),
  sourceType: ProductSourceTypeSchema,
  sourceId: z.string().optional(),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  importedFrom: z.string().max(100).optional(),
  supplierSku: z.string().max(60).optional(),
  supplierPrice: z.number().positive().optional(),
  leadTime: z.string().max(80).optional(),
  moq: z.number().int().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

export const ProductSourceUpdateSchema = ProductSourceCreateSchema.partial();

export const ProductSourceSchema = ProductSourceCreateSchema.extend({
  id: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Store Product Query / Filter ──────────────────────────────────────────────

export const StoreProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  visibility: ProductVisibilitySchema.optional(),
  inventoryType: InventoryTypeSchema.optional(),
  categoryId: z.string().optional(),
  collectionId: z.string().optional(),
  q: z.string().max(200).optional(),
  featured: z.coerce.boolean().optional(),
  lowStock: z.coerce.boolean().optional(),
  sort: z.enum(["newest", "oldest", "price_low", "price_high", "name", "sales"]).default("newest"),
});

// ─── Dropship ─────────────────────────────────────────────────────────────────

export const StartDropshipSchema = z.object({
  supplierProductId: z.string(),
  retailPrice: z.number().positive(),
});

// ─── Supplier Quote Request ───────────────────────────────────────────────────

export const QuoteRequestCreateSchema = z.object({
  supplierId: z.string(),
  supplierProductId: z.string(),
  quantity: z.number().int().min(1),
  destination: z.string().min(2).max(200),
  notes: z.string().max(1000).optional(),
});

export const QuoteResponseSchema = z.object({
  quotedPrice: z.number().positive(),
  supplierResponse: z.string().max(1000).optional(),
  expiresAt: z.coerce.date().optional(),
});

// ─── Wholesale Order ──────────────────────────────────────────────────────────

export const WholesaleOrderCreateSchema = z.object({
  // Optional: the product names its supplier; when sent it must match.
  supplierId: z.string().max(64).optional(),
  supplierProductId: z.string().min(1).max(64),
  quantity: z.number().int().min(1, "Enter how many you want.").max(1_000_000),
  deliveryAddress: z.string().trim().min(5, "Enter the full delivery address.").max(300),
  notes: z.string().trim().max(1000).optional(),
});

export const OrderStatusUpdateSchema = z.object({
  status: OrderStatusSchema,
  trackingCode: z.string().max(80).optional(),
});

// ─── Logistics Partner ────────────────────────────────────────────────────────

export const LogisticsPartnerCreateSchema = z.object({
  companyName: z.string().min(2).max(120),
  displayName: z.string().min(2).max(120),
  country: z.string().min(2).max(60),
  city: z.string().min(2).max(60),
  address: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  coverageZones: z.array(z.string()).min(1),
  vehicleTypes: z.array(z.string()).min(1),
  deliveryTypes: z.array(z.string()).min(1),
  pricingModel: z.enum(["fixed", "weight_based", "distance_based"]).default("fixed"),
  basePrice: z.number().min(0).default(0),
  estimatedSpeed: z.string().max(80).optional(),
  whatsappNumber: z.string().max(20).optional(),
});

export const LogisticsPartnerUpdateSchema = LogisticsPartnerCreateSchema.partial();

export const DeliveryScopeEnum = z.enum(["intrastate", "interstate", "cross_country", "regional"]);

export const LogisticsCoverageZoneSchema = z.object({
  name: z.string().min(1).max(80),
  country: z.string().min(1).max(60),
  region: z.string().min(1).max(80),
  scope: DeliveryScopeEnum.default("intrastate"),
  service: z.string().max(80).default("Same-day"),
  basePrice: z.number().min(0).default(0),
  active: z.boolean().default(true),
  demandSignal: z.string().max(120).optional(),
  polygon: z.array(z.tuple([z.number(), z.number()])).max(16).optional(),
});

export const LogisticsOnboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  country: z.string().min(2).max(60).optional(),
  city: z.string().min(2).max(60).optional(),
  description: z.string().max(2000).optional(),
  coverageZones: z.array(z.string().min(1).max(80)).min(1).max(30),
  vehicleTypes: z.array(z.string().min(1).max(40)).min(1).max(12),
  deliveryTypes: z.array(z.string().min(1).max(40)).min(1).max(12),
  pricingModel: z.enum(["fixed", "weight_based", "distance_based"]).default("fixed"),
  basePrice: z.number().min(0).default(0),
  estimatedSpeed: z.string().max(80).optional(),
  coverageMap: z.object({
    zones: z.array(LogisticsCoverageZoneSchema).max(30).default([]),
    depot: z.string().max(120).optional(),
    updatedBy: z.literal("onboarding").default("onboarding"),
  }).default({ zones: [], updatedBy: "onboarding" }),
  completed: z.boolean().default(false),
});

export const LogisticsCoverageUpdateSchema = z.object({
  coverageZones: z.array(z.string().min(1).max(80)).min(1).max(30),
  vehicleTypes: z.array(z.string().min(1).max(40)).min(1).max(12),
  deliveryTypes: z.array(z.string().min(1).max(40)).min(1).max(12),
  coverageMap: z.object({
    zones: z.array(LogisticsCoverageZoneSchema).max(30).default([]),
    depot: z.string().max(120).optional(),
    updatedBy: z.literal("portal").default("portal"),
  }).default({ zones: [], updatedBy: "portal" }),
});

export const LogisticsPricingUpdateSchema = z.object({
  pricingModel: z.enum(["fixed", "weight_based", "distance_based"]),
  basePrice: z.number().min(0),
  estimatedSpeed: z.string().max(80).optional(),
});

export const LogisticsPartnerSchema = LogisticsPartnerCreateSchema.extend({
  id: z.string(),
  slug: z.string(),
  userId: z.string(),
  verificationStatus: VerificationStatusSchema,
  reliabilityScore: z.number().int(),
  rating: z.number(),
  ratingCount: z.number().int(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── Delivery Quote Request ───────────────────────────────────────────────────

export const DeliveryQuoteRequestSchema = z.object({
  logisticsPartnerId: z.string(),
  pickupLocation: z.string().min(2).max(300),
  destination: z.string().min(2).max(300),
  packageDetails: z.object({
    weight: z.number().positive().optional(),
    dimensions: z.object({ l: z.number(), w: z.number(), h: z.number() }).optional(),
    fragile: z.boolean().default(false),
    description: z.string().max(500).optional(),
  }),
  preferredDate: z.coerce.date().optional(),
});

export const DeliveryQuoteResponseSchema = z.object({
  quotedPrice: z.number().positive(),
  partnerResponse: z.string().max(1000).optional(),
  expiresAt: z.coerce.date().optional(),
});

// ─── Delivery Booking ─────────────────────────────────────────────────────────

export const DeliveryBookingCreateSchema = z.object({
  logisticsPartnerId: z.string(),
  orderId: z.string().optional(),
  pickupLocation: z.string().min(2).max(300),
  destination: z.string().min(2).max(300),
  packageDetails: z.object({
    weight: z.number().positive().optional(),
    dimensions: z.object({ l: z.number(), w: z.number(), h: z.number() }).optional(),
    fragile: z.boolean().default(false),
    description: z.string().max(500).optional(),
  }),
  deliveryFee: z.number().positive(),
  currency: z.string().length(3).default("NGN"),
  estimatedDelivery: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});

export const BookingStatusUpdateSchema = z.object({
  status: BookingStatusSchema,
  trackingCode: z.string().max(80).optional(),
  estimatedDelivery: z.coerce.date().optional(),
  deliveredAt: z.coerce.date().optional(),
});

// ─── Public API filter schemas ────────────────────────────────────────────────

export const PublicProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: SortSchema,
  category: z.string().optional(),
  country: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  dropship: z.coerce.boolean().optional(),
  q: z.string().max(200).optional(),
});

export const PublicSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: SupplierSortSchema,
  country: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  businessType: BusinessTypeSchema.optional(),
  verified: z.coerce.boolean().optional(),
  q: z.string().max(200).optional(),
});

export const PublicLogisticsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: LogisticsSortSchema,
  country: z.string().optional(),
  city: z.string().optional(),
  zone: z.string().optional(),
  vehicleType: z.string().optional(),
  q: z.string().max(200).optional(),
  /** "true": only partners taking pay-when-it-arrives (cash) jobs now, skipping those paused for a late pay-in. */
  cod: z.enum(["true", "false", "1", "0"]).optional(),
});

// ─── Notification Enums ────────────────────────────────────────────────────────

export const NotificationTypeSchema = z.enum(["order", "payout", "peggy", "marketplace", "system", "inventory", "logistics", "products", "customers", "suppliers", "store_builder", "marketing", "rexai", "checkout", "category", "health", "activity", "dropshipping"]);
export const NotificationPrioritySchema = z.enum(["critical", "warning", "info", "success"]);
export const NotificationChannelSchema = z.enum(["in_app", "email", "sms", "whatsapp", "push", "browser"]);
export const DigestFrequencySchema = z.enum(["immediate", "hourly", "daily", "weekly", "disabled"]);

export const NotificationCreateSchema = z.object({
  type: NotificationTypeSchema,
  priority: NotificationPrioritySchema.default("info"),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  link: z.string().max(500).optional(),
  actionLabel: z.string().max(60).optional(),
  actionUrl: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  metadata: jsonObject().default({}),
  channel: NotificationChannelSchema.default("in_app"),
  scheduledFor: z.coerce.date().optional(),
});

export const NotificationUpdateSchema = z.object({
  read: z.boolean(),
  readAt: z.coerce.date().optional(),
});

export const NotificationBulkReadSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string()).optional(),
});

export const NotificationPreferenceCreateSchema = z.object({
  eventKey: z.string(),
  category: NotificationTypeSchema,
  inApp: z.boolean().default(true),
  email: z.boolean().default(false),
  sms: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
  push: z.boolean().default(false),
  browser: z.boolean().default(false),
  digestFrequency: DigestFrequencySchema.default("immediate"),
});

export const NotificationPreferenceUpdateSchema = NotificationPreferenceCreateSchema.partial();

export const ActivityEventCreateSchema = z.object({
  type: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  metadata: jsonObject().default({}),
});

export const SmartAlertRuleCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  trigger: z.string(),
  condition: jsonObject().default({}),
  actionType: z.string().default("notification"),
  actionConfig: jsonObject().default({}),
  active: z.boolean().default(true),
});

export const SmartAlertRuleUpdateSchema = SmartAlertRuleCreateSchema.partial();

// ─── Subscriber ────────────────────────────────────────────────────────────────

export const SubscriberSourceSchema = z.enum(["newsletter_form", "checkout_optin", "customer_account", "lead_magnet", "popup", "landing_page", "manual_import", "csv_upload", "api", "order"]);
export const SubscriberStatusSchema = z.enum(["active", "unsubscribed", "bounced", "spam"]);

export const SubscriberCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  country: z.string().max(100).optional(),
  source: SubscriberSourceSchema.default("newsletter_form"),
  tags: z.array(z.string()).default([]),
  metadata: jsonObject().default({}),
});

export const SubscriberUpdateSchema = SubscriberCreateSchema.partial().extend({
  status: SubscriberStatusSchema.optional(),
});

export const SubscriberBulkImportSchema = z.object({
  subscribers: z.array(SubscriberCreateSchema).min(1).max(500),
});

// ─── Customer Segment ──────────────────────────────────────────────────────────

export const CustomerSegmentCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  type: z.enum(["manual", "auto"]).default("manual"),
  rules: jsonObject().default({}),
});

export const CustomerSegmentUpdateSchema = CustomerSegmentCreateSchema.partial();

// ─── Store Form ────────────────────────────────────────────────────────────────

export const FormTypeSchema = z.enum(["newsletter", "contact", "lead", "custom", "request_quote", "waitlist", "product_inquiry", "wholesale_inquiry", "support", "popup"]);

export const FormFieldSchema = z.object({
  key: z.string(),
  type: z.enum(["text", "email", "phone", "textarea", "select", "checkbox", "radio", "file"]),
  label: z.string(),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export const FormActionSchema = z.object({
  type: z.enum(["show_message", "send_email", "add_subscriber", "create_lead", "notify_seller", "redirect", "trigger_automation"]),
  config: jsonObject().default({}),
});

export const StoreFormCreateSchema = z.object({
  type: FormTypeSchema.default("contact"),
  name: z.string().min(1).max(120),
  fields: z.array(FormFieldSchema).default([]),
  design: jsonObject().default({}),
  actions: z.array(FormActionSchema).default([]),
  isPopup: z.boolean().default(false),
  popupConfig: jsonObject().default({}),
  active: z.boolean().default(true),
});

export const StoreFormUpdateSchema = StoreFormCreateSchema.partial();

// ─── Live Chat Config ──────────────────────────────────────────────────────────

export const LiveChatConfigCreateSchema = z.object({
  mode: z.enum(["contact_form", "whatsapp", "messaging", "multiple"]).default("contact_form"),
  whatsappNumber: z.string().max(30).optional(),
  whatsappGreeting: z.string().max(200).optional(),
  whatsappPosition: z.enum(["left", "right"]).default("right"),
  whatsappColor: z.string().default("#25D366"),
  showOnMobile: z.boolean().default(true),
  showOnDesktop: z.boolean().default(true),
  businessHours: jsonObject().default({}),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(30).optional(),
  customLink: z.string().max(500).optional(),
  widgetStyle: z.enum(["bubble", "bar", "drawer", "center", "help"]).default("bubble"),
  greeting: z.string().max(200).optional(),
});

export const LiveChatConfigUpdateSchema = LiveChatConfigCreateSchema.partial();

// ─── Discount ──────────────────────────────────────────────────────────────────

export const DiscountTypeSchema = z.enum(["percentage", "fixed_amount", "free_shipping"]);

export const DiscountCreateSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40).transform((v) => v.toUpperCase().replace(/\s+/g, "")),
  type: DiscountTypeSchema.default("percentage"),
  value: z.number().positive(),
  minOrder: z.number().min(0).optional(),
  maxUses: z.number().int().min(0).optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  status: z.enum(["draft", "active", "expired", "disabled"]).default("draft"),
});

export const DiscountUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  code: z.string().min(1).max(40).optional(),
  type: DiscountTypeSchema.optional(),
  value: z.number().positive().optional(),
  minOrder: z.number().min(0).optional().nullable(),
  maxUses: z.number().int().min(0).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  status: z.enum(["draft", "active", "expired", "disabled"]).optional(),
});

// ─── Coupon ────────────────────────────────────────────────────────────────────

export const CouponTypeSchema = z.enum(["percentage", "fixed_amount"]);

export const CouponCreateSchema = z.object({
  action: z.literal("generate").optional(),
  code: z.string().min(1).max(40).optional(),
  type: CouponTypeSchema.default("percentage"),
  value: z.number().positive(),
  minOrder: z.number().min(0).optional(),
  maxUses: z.number().int().min(0).default(1),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const CouponValidateSchema = z.object({
  code: z.string().min(1).max(40),
  storeId: z.string().min(1),
  subtotal: z.number().min(0).default(0),
});

// ─── Blog Post ─────────────────────────────────────────────────────────────────

export const BlogPostCreateSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  bodyMarkdown: z.string().min(1),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  keywords: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
  publish: z.boolean().optional(),
  wordCount: z.number().int().min(0).optional(),
  createdAt: z.string().optional(),
});

// ─── Automation Rule ───────────────────────────────────────────────────────────

export const AutomationRuleCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).default(""),
  trigger: z.enum([
    "welcome_email", "order_placed", "order_shipped", "order_delivered", "payment_received",
    "abandoned_checkout", "new_customer", "post_purchase", "review_request", "win_back",
    "birthday", "low_stock",
  ]),
  actionType: z.enum(["send_email", "send_notification", "update_discount", "add_tag", "add_segment"]).default("send_email"),
  actionConfig: jsonObject().default({}),
  delayMinutes: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const AutomationRuleUpdateSchema = AutomationRuleCreateSchema.partial();

// ─── Broadcast Campaign ────────────────────────────────────────────────────────

export const BroadcastCampaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  preheader: z.string().max(200).optional(),
  bodyHtml: z.string().default(""),
  templateId: z.string().optional(),
  senderName: z.string().max(120).optional(),
  senderEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  campaignType: z.enum(["newsletter", "promo", "abandoned_cart", "welcome", "custom"]).default("newsletter"),
  recipientFilter: z.array(z.string()).default([]),
  segmentId: z.string().optional(),
});

export const BroadcastCampaignUpdateSchema = BroadcastCampaignCreateSchema.partial().extend({
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
});

// ─── Cart Settings ─────────────────────────────────────────────────────────────

export const CartSettingsUpdateSchema = z.object({
  addToCartLabel: z.enum(["add_to_cart", "buy_now", "shop_now", "order_now", "get_yours", "i_need_this", "book_now"]).optional(),
  addToCartBehavior: z.enum(["drawer", "cart_page", "checkout", "modal", "notification"]).optional(),
  cartStyle: z.enum(["right-drawer", "left-drawer", "dropdown", "page", "slide-up", "fullscreen", "minimal-bar"]).optional(),
  enableWishlist: z.boolean().optional(),
});

// ─── Checkout Modules ──────────────────────────────────────────────────────────

export const CheckoutModulesUpdateSchema = z.object({
  enabledModules: z.array(z.string()).optional(),
  moduleOrder: z.array(z.string()).optional(),
});

// ─── Editor Update ─────────────────────────────────────────────────────────────

export const EditorUpdateSchema = z.object({
  snapshot: jsonObject().optional(),
  ops: z.array(z.unknown()).optional(),
  hydrateFromStoreConfig: jsonObject().optional(),
});

// ─── Type exports ──────────────────────────────────────────────────────────────

export type DiscountCreate = z.infer<typeof DiscountCreateSchema>;
export type DiscountUpdate = z.infer<typeof DiscountUpdateSchema>;
export type CouponCreate = z.infer<typeof CouponCreateSchema>;
export type BlogPostCreate = z.infer<typeof BlogPostCreateSchema>;
export type AutomationRuleCreate = z.infer<typeof AutomationRuleCreateSchema>;
export type AutomationRuleUpdate = z.infer<typeof AutomationRuleUpdateSchema>;
export type BroadcastCampaignCreate = z.infer<typeof BroadcastCampaignCreateSchema>;
export type BroadcastCampaignUpdate = z.infer<typeof BroadcastCampaignUpdateSchema>;
export type CartSettingsUpdate = z.infer<typeof CartSettingsUpdateSchema>;
export type CheckoutModulesUpdate = z.infer<typeof CheckoutModulesUpdateSchema>;

// ─── Abandoned Cart Config ─────────────────────────────────────────────────────

export const AbandonedCartConfigCreateSchema = z.object({
  enabled: z.boolean().default(true),
  firstReminderAfter: z.number().int().min(5).default(60),
  secondReminderAfter: z.number().int().min(60).default(1440),
  thirdReminderAfter: z.number().int().min(60).default(4320),
  discountPercent: z.number().min(0).max(100).default(0),
  sendEmail: z.boolean().default(true),
  emailTemplateId: z.string().optional(),
});

export const AbandonedCartConfigUpdateSchema = AbandonedCartConfigCreateSchema.partial();

// ─── Type exports ─────────────────────────────────────────────────────────────

export type Role = z.infer<typeof RoleSchema>;
export type SupplierCreate = z.infer<typeof SupplierCreateSchema>;
export type SupplierProductCreate = z.infer<typeof SupplierProductCreateSchema>;
export type StoreCreate = z.infer<typeof StoreCreateSchema>;
export type StoreProductCreate = z.infer<typeof StoreProductCreateSchema>;
export type LogisticsPartnerCreate = z.infer<typeof LogisticsPartnerCreateSchema>;
export type QuoteRequestCreate = z.infer<typeof QuoteRequestCreateSchema>;
export type WholesaleOrderCreate = z.infer<typeof WholesaleOrderCreateSchema>;
export type DeliveryQuoteRequest = z.infer<typeof DeliveryQuoteRequestSchema>;
export type DeliveryBookingCreate = z.infer<typeof DeliveryBookingCreateSchema>;
export type PublicProductsQuery = z.infer<typeof PublicProductsQuerySchema>;
export type PublicSuppliersQuery = z.infer<typeof PublicSuppliersQuerySchema>;
export type PublicLogisticsQuery = z.infer<typeof PublicLogisticsQuerySchema>;
export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
export type ShippingZoneCreate = z.infer<typeof ShippingZoneCreateSchema>;
export type ShippingZoneUpdate = z.infer<typeof ShippingZoneUpdateSchema>;
export type CheckoutConfigCreate = z.infer<typeof CheckoutConfigCreateSchema>;
export type CheckoutConfigUpdate = z.infer<typeof CheckoutConfigUpdateSchema>;
export type ProductPageTemplateCreate = z.infer<typeof ProductPageTemplateCreateSchema>;
export type ProductPageTemplateUpdate = z.infer<typeof ProductPageTemplateUpdateSchema>;
export type ProductSourceCreate = z.infer<typeof ProductSourceCreateSchema>;
export type ProductSourceUpdate = z.infer<typeof ProductSourceUpdateSchema>;
export type InventoryUpdate = z.infer<typeof InventoryUpdateSchema>;
export type StockMovementCreate = z.infer<typeof StockMovementCreateSchema>;
export type StoreProductQuery = z.infer<typeof StoreProductQuerySchema>;
export type NotificationCreate = z.infer<typeof NotificationCreateSchema>;
export type NotificationPreferenceCreate = z.infer<typeof NotificationPreferenceCreateSchema>;
export type ActivityEventCreate = z.infer<typeof ActivityEventCreateSchema>;
export type SmartAlertRuleCreate = z.infer<typeof SmartAlertRuleCreateSchema>;
export type SmartAlertRuleUpdate = z.infer<typeof SmartAlertRuleUpdateSchema>;
export type SubscriberCreate = z.infer<typeof SubscriberCreateSchema>;
export type SubscriberUpdate = z.infer<typeof SubscriberUpdateSchema>;
export type CustomerSegmentCreate = z.infer<typeof CustomerSegmentCreateSchema>;
export type CustomerSegmentUpdate = z.infer<typeof CustomerSegmentUpdateSchema>;
export type StoreFormCreate = z.infer<typeof StoreFormCreateSchema>;
export type StoreFormUpdate = z.infer<typeof StoreFormUpdateSchema>;
export type LiveChatConfigCreate = z.infer<typeof LiveChatConfigCreateSchema>;
export type LiveChatConfigUpdate = z.infer<typeof LiveChatConfigUpdateSchema>;
export type AbandonedCartConfigCreate = z.infer<typeof AbandonedCartConfigCreateSchema>;
export type AbandonedCartConfigUpdate = z.infer<typeof AbandonedCartConfigUpdateSchema>;
