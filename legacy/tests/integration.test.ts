import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

describe("Database schema", () => {
  it("models are accessible", async () => {
    const userCount = await db.user.count();
    assert.equal(typeof userCount, "number");
  });

  it("category model exists with expected fields", async () => {
    const category = await db.category.findFirst();
    if (category) {
      assert.ok(category.id);
      assert.ok(category.name);
      assert.ok(category.slug);
    }
  });

  it("supplier model exists", async () => {
    const supplier = await db.supplier.findFirst();
    if (supplier) {
      assert.ok(supplier.businessName);
      assert.ok(supplier.userId);
    }
  });

  it("supplier product model exists", async () => {
    const product = await db.supplierProduct.findFirst();
    if (product) {
      assert.ok(product.name);
      assert.ok(product.supplierId);
      assert.ok(product.categoryId);
    }
  });

  it("logistics partner model exists", async () => {
    const partner = await db.logisticsPartner.findFirst();
    if (partner) {
      assert.ok(partner.companyName);
      assert.ok(partner.country);
    }
  });

  it("store model exists", async () => {
    const store = await db.store.findFirst();
    if (store) {
      assert.ok(store.name);
      assert.ok(store.slug);
      assert.ok(store.userId);
    }
  });

  it("retail order model exists", async () => {
    const order = await db.retailOrder.findFirst();
    if (order) {
      assert.ok(order.orderNumber);
      assert.ok(order.storeId);
      assert.ok(order.buyerEmail);
    }
  });

  it("delivery booking model exists", async () => {
    const booking = await db.deliveryBooking.findFirst();
    if (booking) {
      assert.ok(booking.trackingCode);
      assert.ok(booking.logisticsPartnerId);
    }
  });
});

describe("Relations", () => {
  it("supplier products link to categories", async () => {
    const product = await db.supplierProduct.findFirst({
      include: { category: true },
    });
    if (product) {
      assert.ok(product.category);
    }
  });

  it("stores link to users", async () => {
    const store = await db.store.findFirst({
      include: { user: true },
    });
    if (store) {
      assert.ok(store.user);
      assert.equal(store.user.id, store.userId);
    }
  });
});
