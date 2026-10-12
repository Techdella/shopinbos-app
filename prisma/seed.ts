import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

// Shell variables win, then .env.local, then .env, so an explicit target is never overridden.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!connectionString) throw new Error("Set DATABASE_URL (or DIRECT_URL) before seeding.");

// Prisma 7 requires a driver adapter.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function main() {
  console.log("🌱 Seeding Shopinbos marketplace...");

  // ─── Categories ──────────────────────────────────────────────────────────────

  const categoryData = [
    { name: "Fashion & Clothing", slug: "fashion-clothing", description: "Clothing, shoes, and accessories from African designers and wholesalers.", sortOrder: 1 },
    { name: "Beauty & Skincare", slug: "beauty-skincare", description: "Natural beauty, skincare, haircare, and personal care products.", sortOrder: 2 },
    { name: "Electronics & Gadgets", slug: "electronics-gadgets", description: "Mobile phones, accessories, and consumer electronics.", sortOrder: 3 },
    { name: "Food & Groceries", slug: "food-groceries", description: "African food staples, spices, snacks, and imported groceries.", sortOrder: 4 },
    { name: "Home & Living", slug: "home-living", description: "Furniture, décor, kitchenware, and household supplies.", sortOrder: 5 },
    { name: "Health & Wellness", slug: "health-wellness", description: "Vitamins, supplements, fitness equipment, and wellness products.", sortOrder: 6 },
    { name: "Kids & Baby", slug: "kids-baby", description: "Baby essentials, toys, and clothing for children.", sortOrder: 7 },
    { name: "Ankara & Fabrics", slug: "ankara-fabrics", description: "Ankara, kente, aso-oke, and other African fabrics sold by the metre.", sortOrder: 8 },
    { name: "Wholesale Supply", slug: "wholesale-supply", description: "Bulk wholesale goods for resale across all categories.", sortOrder: 9 },
  ];

  const categories: Record<string, { id: string }> = {};
  for (const cat of categoryData) {
    const created = await db.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
    categories[cat.slug] = created;
    console.log(`  ✓ Category: ${cat.name}`);
  }

  // ─── Supplier users ───────────────────────────────────────────────────────────

  const supplierUsersData = [
    {
      supabaseId: "seed-supplier-001",
      name: "Chukwuemeka Eze",
      email: "eze.supply@shopinbos.dev",
      role: "supplier" as const,
      country: "Nigeria",
      city: "Lagos",
    },
    {
      supabaseId: "seed-supplier-002",
      name: "Amina Bello",
      email: "amina.beauty@shopinbos.dev",
      role: "supplier" as const,
      country: "Nigeria",
      city: "Abuja",
    },
    {
      supabaseId: "seed-supplier-003",
      name: "Kwame Asante",
      email: "kwame.fabrics@shopinbos.dev",
      role: "supplier" as const,
      country: "Ghana",
      city: "Accra",
    },
    {
      supabaseId: "seed-supplier-004",
      name: "Grace Kamau",
      email: "grace.wellness@shopinbos.dev",
      role: "supplier" as const,
      country: "Kenya",
      city: "Nairobi",
    },
  ];

  const supplierUsers: Record<string, { id: string }> = {};
  for (const u of supplierUsersData) {
    const user = await db.user.upsert({
      where: { supabaseId: u.supabaseId },
      update: u,
      create: u,
    });
    supplierUsers[u.supabaseId] = user;
    console.log(`  ✓ Supplier user: ${u.name}`);
  }

  // ─── Suppliers ────────────────────────────────────────────────────────────────

  const supplierData = [
    {
      userId: supplierUsers["seed-supplier-001"].id,
      businessName: "Lagos Fashion Wholesale",
      displayName: "Lagos Fashion",
      slug: "lagos-fashion-wholesale",
      businessType: "wholesaler" as const,
      country: "Nigeria",
      city: "Lagos",
      address: "Trade Fair Complex, Lagos",
      description: "Nigeria's largest wholesale fashion distributor. Specialising in Ankara, dashiki, and contemporary African street fashion. Over 15 years serving retailers across Lagos and Abuja.",
      categories: ["fashion-clothing", "ankara-fabrics"],
      verificationStatus: "verified" as const,
      trustScore: 92,
      rating: 4.7,
      ratingCount: 318,
      responseTimeLabel: "Replies in 2h",
      whatsappNumber: "+2348012345678",
    },
    {
      userId: supplierUsers["seed-supplier-002"].id,
      businessName: "Naija Naturals Cosmetics",
      displayName: "Naija Naturals",
      slug: "naija-naturals-cosmetics",
      businessType: "manufacturer" as const,
      country: "Nigeria",
      city: "Abuja",
      description: "Premium natural beauty brand from Abuja. We manufacture and supply shea butter creams, black soap, argan oil blends, and natural hair care products sourced from across West Africa.",
      categories: ["beauty-skincare", "health-wellness"],
      verificationStatus: "verified" as const,
      trustScore: 88,
      rating: 4.9,
      ratingCount: 204,
      responseTimeLabel: "Replies in 4h",
      whatsappNumber: "+2348023456789",
    },
    {
      userId: supplierUsers["seed-supplier-003"].id,
      businessName: "Accra Fabrics Co.",
      displayName: "Accra Fabrics",
      slug: "accra-fabrics-co",
      businessType: "importer" as const,
      country: "Ghana",
      city: "Accra",
      description: "Accra's top fabric importer and wholesaler. We source kente, kaba, and exclusive print fabrics from Kumasi artisans and international manufacturers.",
      categories: ["ankara-fabrics", "fashion-clothing"],
      verificationStatus: "verified" as const,
      trustScore: 84,
      rating: 4.6,
      ratingCount: 147,
      responseTimeLabel: "Replies same day",
    },
    {
      userId: supplierUsers["seed-supplier-004"].id,
      businessName: "Nairobi Wellness Hub",
      displayName: "NBI Wellness",
      slug: "nairobi-wellness-hub",
      businessType: "wholesaler" as const,
      country: "Kenya",
      city: "Nairobi",
      description: "East Africa's trusted wellness supplier. We distribute vitamins, herbal supplements, fitness accessories, and organic foods to pharmacies and wellness retailers across the region.",
      categories: ["health-wellness", "food-groceries"],
      verificationStatus: "pending" as const,
      trustScore: 68,
      rating: 4.4,
      ratingCount: 63,
      responseTimeLabel: "Replies in 1 day",
    },
  ];

  const suppliers: Record<string, { id: string }> = {};
  for (const s of supplierData) {
    const created = await db.supplier.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
    suppliers[s.slug] = created;
    console.log(`  ✓ Supplier: ${s.businessName}`);
  }

  // ─── Supplier Products ────────────────────────────────────────────────────────

  const productData = [
    // Lagos Fashion Wholesale
    {
      supplierId: suppliers["lagos-fashion-wholesale"].id,
      categoryId: categories["ankara-fabrics"].id,
      name: "Premium Ankara Print Fabric — Vibrant Floral",
      slug: "premium-ankara-print-fabric-vibrant-floral",
      description: "High-quality 100% cotton Ankara fabric from Vlisco-inspired looms. Bold floral pattern in traditional orange, teal, and gold colourway. Sold by the metre, minimum 20m per order.",
      images: ["https://images.unsplash.com/photo-1552710307-537199cd41c0?auto=format&fit=crop&w=1000&h=1000&q=75", "https://images.unsplash.com/photo-1769420290265-6359445daaa4?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 1200,
      suggestedRetailPrice: 2200,
      currency: "NGN",
      moq: 20,
      stockQuantity: 840,
      dropshipAvailable: false,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Lagos", "Abuja", "Port Harcourt", "Kano"],
      processingTime: "3–5 business days",
      trendScore: 94,
      status: "published" as const,
    },
    {
      supplierId: suppliers["lagos-fashion-wholesale"].id,
      categoryId: categories["fashion-clothing"].id,
      name: "Classic Dashiki Shirt — Assorted Sizes & Colours",
      slug: "classic-dashiki-shirt-assorted-sizes-colours",
      description: "Traditional African dashiki shirt with rich embroidered collar. Available in S–3XL. Packed in assorted colour bundles of 12. Perfect for Afro-boutiques, events stores, and festival sellers.",
      images: ["https://images.unsplash.com/photo-1648329008114-bce0ec0b5950?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 3500,
      suggestedRetailPrice: 7000,
      currency: "NGN",
      moq: 12,
      stockQuantity: 360,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Nigeria", "Ghana", "Benin"],
      processingTime: "2–3 business days",
      trendScore: 78,
      status: "published" as const,
    },
    {
      supplierId: suppliers["lagos-fashion-wholesale"].id,
      categoryId: categories["fashion-clothing"].id,
      name: "Women's Iro and Buba Set — Aso-oke Blend",
      slug: "womens-iro-buba-set-aso-oke-blend",
      description: "Elegant iro and buba set crafted from premium aso-oke blend. Suitable for owambe, traditional ceremonies, and cultural events. Available in 8 colours.",
      images: ["https://images.unsplash.com/photo-1751374858042-b8b9ff8480aa?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 8500,
      suggestedRetailPrice: 18000,
      currency: "NGN",
      moq: 5,
      stockQuantity: 120,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: false,
      deliveryRegions: ["Lagos", "Abuja", "Ibadan"],
      processingTime: "5–7 business days",
      trendScore: 61,
      status: "published" as const,
    },

    // Naija Naturals
    {
      supplierId: suppliers["naija-naturals-cosmetics"].id,
      categoryId: categories["beauty-skincare"].id,
      name: "Whipped Shea Butter Cream — 500g",
      slug: "whipped-shea-butter-cream-500g",
      description: "Pure whipped shea butter enriched with vitamin E and coconut oil. Deeply moisturising, fast-absorbing formula loved by over 40,000 buyers across Nigeria. Available in unscented and lavender variants.",
      images: ["https://images.unsplash.com/photo-1638131163449-70059e10de6a?auto=format&fit=crop&w=1000&h=1000&q=75", "https://images.unsplash.com/photo-1762840192336-575fba31d28c?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 1800,
      suggestedRetailPrice: 4500,
      currency: "NGN",
      moq: 50,
      stockQuantity: 2400,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Nigeria", "Ghana", "Kenya"],
      processingTime: "2–4 business days",
      trendScore: 97,
      status: "published" as const,
    },
    {
      supplierId: suppliers["naija-naturals-cosmetics"].id,
      categoryId: categories["beauty-skincare"].id,
      name: "African Black Soap Body Wash — 1 Litre",
      slug: "african-black-soap-body-wash-1-litre",
      description: "Gentle, deep-cleansing body wash made from raw black soap concentrate, plantain ash, and shea oil. Balances skin tone and helps with acne. Bestseller across Lagos skincare retailers.",
      images: ["https://images.unsplash.com/photo-1638131164559-5efa77e52527?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 900,
      suggestedRetailPrice: 2200,
      currency: "NGN",
      moq: 80,
      stockQuantity: 1600,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Nigeria", "Ghana"],
      processingTime: "2–3 business days",
      trendScore: 89,
      status: "published" as const,
    },
    {
      supplierId: suppliers["naija-naturals-cosmetics"].id,
      categoryId: categories["beauty-skincare"].id,
      name: "Pure Argan Oil Hair Serum — 100ml",
      slug: "pure-argan-oil-hair-serum-100ml",
      description: "Cold-pressed Moroccan argan oil blended with West African baobab extract. Eliminates frizz, adds shine, and protects against heat. Popular in natural hair communities across West Africa.",
      images: ["https://images.unsplash.com/photo-1713768704571-6aeb0d0e5105?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 1200,
      suggestedRetailPrice: 3200,
      currency: "NGN",
      moq: 30,
      stockQuantity: 900,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Nigeria"],
      processingTime: "2–3 business days",
      trendScore: 72,
      status: "published" as const,
    },

    // Accra Fabrics
    {
      supplierId: suppliers["accra-fabrics-co"].id,
      categoryId: categories["ankara-fabrics"].id,
      name: "Kente Cloth Strip — Ashanti Weave 6 Yards",
      slug: "kente-cloth-strip-ashanti-weave-6-yards",
      description: "Authentic hand-woven Ashanti kente cloth in 6-yard lengths. Traditional geometric patterns with gold, green, and black threads. Sourced directly from Bonwire weavers in Kumasi, Ghana.",
      images: ["https://images.unsplash.com/photo-1640292343595-889db1c8262e?auto=format&fit=crop&w=1000&h=1000&q=75", "https://images.unsplash.com/photo-1776064797306-a3e7e3607ba2?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 12000,
      suggestedRetailPrice: 28000,
      currency: "GHS",
      moq: 5,
      stockQuantity: 80,
      dropshipAvailable: false,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Ghana", "Nigeria", "Ivory Coast"],
      processingTime: "7–10 business days",
      trendScore: 81,
      status: "published" as const,
    },
    {
      supplierId: suppliers["accra-fabrics-co"].id,
      categoryId: categories["ankara-fabrics"].id,
      name: "Premium Batik Print Fabric — Indigo Series",
      slug: "premium-batik-print-fabric-indigo-series",
      description: "High-thread-count batik fabric in deep indigo, clay, and white. Hand-stamped resist-dye technique from master artisans in Kumasi. 100% cotton, 1.5m width.",
      images: ["https://images.unsplash.com/photo-1763391344453-3b5d70112873?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 8500,
      suggestedRetailPrice: 18000,
      currency: "GHS",
      moq: 10,
      stockQuantity: 150,
      dropshipAvailable: false,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Ghana"],
      processingTime: "5–7 business days",
      trendScore: 65,
      status: "published" as const,
    },

    // Nairobi Wellness Hub
    {
      supplierId: suppliers["nairobi-wellness-hub"].id,
      categoryId: categories["health-wellness"].id,
      name: "Moringa Leaf Capsules — 60 Caps (500mg)",
      slug: "moringa-leaf-capsules-60-caps-500mg",
      description: "Certified organic moringa capsules sourced from Kenyan highlands. Rich in iron, calcium, and vitamins A, C, and E. Third-party lab tested for purity and potency.",
      images: ["https://images.unsplash.com/photo-1781377012601-93162be3a433?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 450,
      suggestedRetailPrice: 1100,
      currency: "KES",
      moq: 100,
      stockQuantity: 3200,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Kenya", "Uganda", "Tanzania"],
      processingTime: "2–3 business days",
      trendScore: 73,
      status: "published" as const,
    },
    {
      supplierId: suppliers["nairobi-wellness-hub"].id,
      categoryId: categories["food-groceries"].id,
      name: "Organic Baobab Powder — 500g",
      slug: "organic-baobab-powder-500g",
      description: "Wild-harvested, cold-processed baobab fruit powder from Tanzania. Natural source of fibre, vitamin C, and antioxidants. Ideal for smoothies, health stores, and organic food brands.",
      images: ["https://images.unsplash.com/photo-1568131154000-d85b62eb6654?auto=format&fit=crop&w=1000&h=1000&q=75"],
      wholesalePrice: 780,
      suggestedRetailPrice: 1800,
      currency: "KES",
      moq: 50,
      stockQuantity: 1400,
      dropshipAvailable: true,
      bulkOrderAvailable: true,
      sampleAvailable: true,
      deliveryRegions: ["Kenya", "Rwanda", "Uganda"],
      processingTime: "3–5 business days",
      trendScore: 58,
      status: "published" as const,
    },
  ];

  for (const p of productData) {
    await db.supplierProduct.upsert({
      where: { slug: p.slug },
      update: p,
      create: p,
    });
    console.log(`  ✓ Product: ${p.name}`);
  }

  // ─── Logistics Partners ───────────────────────────────────────────────────────

  const logisticsUserData = [
    {
      supabaseId: "seed-logistics-001",
      name: "Emeka Logistics",
      email: "emeka.fleet@shopinbos.dev",
      role: "logistics_partner" as const,
      country: "Nigeria",
      city: "Lagos",
    },
    {
      supabaseId: "seed-logistics-002",
      name: "Fatima Swift Delivery",
      email: "fatima.swift@shopinbos.dev",
      role: "logistics_partner" as const,
      country: "Nigeria",
      city: "Abuja",
    },
  ];

  const logisticsUsers: Record<string, { id: string }> = {};
  for (const u of logisticsUserData) {
    const user = await db.user.upsert({
      where: { supabaseId: u.supabaseId },
      update: u,
      create: u,
    });
    logisticsUsers[u.supabaseId] = user;
  }

  const logisticsData = [
    {
      userId: logisticsUsers["seed-logistics-001"].id,
      companyName: "Emeka Fleet Lagos",
      displayName: "Emeka Fleet",
      slug: "emeka-fleet-lagos",
      country: "Nigeria",
      city: "Lagos",
      description: "Lagos-based same-day and next-day delivery for e-commerce sellers. Fleet of 12 bikes and 4 vans covering all 20 Lagos LGAs.",
      coverageZones: ["Ikeja", "Yaba", "Victoria Island", "Lekki", "Surulere", "Ikorodu", "Ajah", "Ibeju-Lekki"],
      vehicleTypes: ["bike", "van"],
      deliveryTypes: ["same_day", "next_day", "express"],
      pricingModel: "distance_based",
      basePrice: 800,
      estimatedSpeed: "2–8 hours",
      reliabilityScore: 91,
      rating: 4.8,
      ratingCount: 412,
      verificationStatus: "verified" as const,
      whatsappNumber: "+2348034567890",
    },
    {
      userId: logisticsUsers["seed-logistics-002"].id,
      companyName: "SwiftLane Abuja",
      displayName: "SwiftLane",
      slug: "swiftlane-abuja",
      country: "Nigeria",
      city: "Abuja",
      description: "Abuja's fastest growing last-mile delivery service. Specialising in e-commerce fulfilment for fashion and beauty sellers across the FCT and surrounding states.",
      coverageZones: ["Wuse", "Garki", "Maitama", "Gwarinpa", "Lugbe", "Kubwa", "Karu"],
      vehicleTypes: ["bike", "van", "truck"],
      deliveryTypes: ["same_day", "next_day", "bulk"],
      pricingModel: "fixed",
      basePrice: 1200,
      estimatedSpeed: "3–12 hours",
      reliabilityScore: 86,
      rating: 4.6,
      ratingCount: 189,
      verificationStatus: "verified" as const,
      whatsappNumber: "+2348045678901",
    },
  ];

  for (const l of logisticsData) {
    await db.logisticsPartner.upsert({
      where: { slug: l.slug },
      update: l,
      create: l,
    });
    console.log(`  ✓ Logistics partner: ${l.companyName}`);
  }

  // ─── Demo seller ──────────────────────────────────────────────────────────────

  const sellerUser = await db.user.upsert({
    where: { supabaseId: "seed-seller-001" },
    update: { name: "Chioma Eze", email: "chioma@shopinbos.dev", role: "seller", country: "Nigeria", city: "Lagos" },
    create: { supabaseId: "seed-seller-001", name: "Chioma Eze", email: "chioma@shopinbos.dev", role: "seller", country: "Nigeria", city: "Lagos" },
  });

  // The demo seller has finished onboarding so the dashboard, insights and storefront render with data.
  const launched = { onboardingState: "LIVE", firstDashboardVisitComplete: true, status: "active" };
  const store = await db.store.upsert({
    where: { userId: sellerUser.id },
    update: { name: "Chioma's Collections", slug: "chiomasc", country: "Nigeria", city: "Lagos", ...launched },
    create: { userId: sellerUser.id, name: "Chioma's Collections", slug: "chiomasc", country: "Nigeria", city: "Lagos", currency: "NGN", ...launched },
  });

  const demoProducts = [
    { id: "seed-store-product-001", name: "Ankara Tote Bag", retailPrice: 18500, currentStock: 24 },
    { id: "seed-store-product-002", name: "Shea Butter Glow Set", retailPrice: 9500, currentStock: 40 },
  ];
  for (const product of demoProducts) {
    await db.storeProduct.upsert({
      where: { id: product.id },
      update: { name: product.name, retailPrice: product.retailPrice, currentStock: product.currentStock, status: "published" },
      create: { ...product, storeId: store.id, userId: sellerUser.id, images: [], tags: [], status: "published", visibility: "storefront" },
    });
  }

  const day = 86_400_000;
  const demoOrders = [
    { orderNumber: "SEED-1001", buyerEmail: "ada@example.com", buyerName: "Ada Obi", city: "Lagos", product: 0, qty: 2, daysAgo: 2, status: "delivered" },
    { orderNumber: "SEED-1002", buyerEmail: "tunde@example.com", buyerName: "Tunde Bello", city: "Abuja", product: 1, qty: 1, daysAgo: 9, status: "shipped" },
    { orderNumber: "SEED-1003", buyerEmail: "ada@example.com", buyerName: "Ada Obi", city: "Lagos", product: 1, qty: 3, daysAgo: 40, status: "paid" },
    { orderNumber: "SEED-1004", buyerEmail: "kofi@example.com", buyerName: "Kofi Mensah", city: "Accra", product: 0, qty: 1, daysAgo: 1, status: "pending" },
  ] as const;
  for (const order of demoOrders) {
    const product = demoProducts[order.product];
    const subtotal = product.retailPrice * order.qty;
    const data = {
      storeId: store.id,
      buyerEmail: order.buyerEmail,
      buyerName: order.buyerName,
      deliveryAddress: { street: "12 Market Road", city: order.city, country: "Nigeria" },
      items: [{ productId: product.id, name: product.name, price: product.retailPrice, quantity: order.qty }],
      subtotal,
      shippingFee: 2500,
      total: subtotal + 2500,
      status: order.status,
      createdAt: new Date(Date.now() - order.daysAgo * day),
    };
    await db.retailOrder.upsert({ where: { orderNumber: order.orderNumber }, update: data, create: { ...data, orderNumber: order.orderNumber } });
  }

  console.log(`  ✓ Demo seller: Chioma Eze`);

  console.log("\n✅ Seed complete.");
  console.log(`   ${categoryData.length} categories`);
  console.log(`   ${supplierData.length} suppliers`);
  console.log(`   ${productData.length} products`);
  console.log(`   ${logisticsData.length} logistics partners`);
  console.log(`   1 demo seller`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
