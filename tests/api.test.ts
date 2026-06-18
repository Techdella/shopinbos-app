import { describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:3000";

describe("Public API", () => {
  it("GET /api/public/health returns ok", async () => {
    const res = await fetch(`${BASE}/api/public/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "ok");
  });

  it("GET /api/v1/public/health returns ok", async () => {
    const res = await fetch(`${BASE}/api/v1/public/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "ok");
  });

  it("GET /api/public/categories returns array", async () => {
    const res = await fetch(`${BASE}/api/public/categories`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it("GET /api/v1/public/categories returns array", async () => {
    const res = await fetch(`${BASE}/api/v1/public/categories`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it("GET /api/public/products returns paginated data", async () => {
    const res = await fetch(`${BASE}/api/public/products`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.ok(body.pagination);
    assert.equal(typeof body.pagination.page, "number");
  });

  it("GET /api/v1/public/products returns paginated data", async () => {
    const res = await fetch(`${BASE}/api/v1/public/products`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.ok(body.pagination);
    assert.equal(typeof body.pagination.page, "number");
  });

  it("GET /api/public/suppliers returns array", async () => {
    const res = await fetch(`${BASE}/api/public/suppliers`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it("GET /api/v1/public/suppliers returns array", async () => {
    const res = await fetch(`${BASE}/api/v1/public/suppliers`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it("GET /api/public/logistics/partners returns array", async () => {
    const res = await fetch(`${BASE}/api/public/logistics/partners`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it("GET /api/v1/public/logistics/partners returns array", async () => {
    const res = await fetch(`${BASE}/api/v1/public/logistics/partners`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });
});

describe("Auth", () => {
  it("login page renders", async () => {
    const res = await fetch(`${BASE}/login`);
    assert.equal(res.status, 200);
  });

  it("home requires auth (redirects to login without cookie)", async () => {
    const res = await fetch(`${BASE}/home`, { redirect: "manual" });
    assert.ok(res.status === 307 || res.status === 302);
  });

  it("supplier dashboard requires auth", async () => {
    const res = await fetch(`${BASE}/supplier/dashboard`, { redirect: "manual" });
    assert.ok(res.status === 307 || res.status === 302);
  });

  it("logistics dashboard requires auth", async () => {
    const res = await fetch(`${BASE}/logistics/dashboard`, { redirect: "manual" });
    assert.ok(res.status === 307 || res.status === 302);
  });

  it("admin dashboard requires auth", async () => {
    const res = await fetch(`${BASE}/admin/dashboard`, { redirect: "manual" });
    assert.ok(res.status === 307 || res.status === 302);
  });
});

describe("Role guards", () => {
  const protectedPages = [
    { path: "/home/dashboard", role: "seller" },
    { path: "/home/logistics", role: "seller" },
    { path: "/home/payments", role: "seller" },
    { path: "/home/marketing", role: "seller" },
    { path: "/home/automations", role: "seller" },
    { path: "/home/discounts", role: "seller" },
    { path: "/home/inventory", role: "seller" },
    { path: "/home/invoices", role: "seller" },
    { path: "/home/reviews", role: "seller" },
    { path: "/home/customers", role: "seller" },
    { path: "/home/insights", role: "seller" },
    { path: "/home/settings", role: "seller" },
    { path: "/seller/store", role: "seller" },
    { path: "/seller/products", role: "seller" },
    { path: "/seller/orders", role: "seller" },
    { path: "/seller/analytics", role: "seller" },
    { path: "/supplier/dashboard", role: "supplier" },
    { path: "/supplier/products", role: "supplier" },
    { path: "/supplier/products/new", role: "supplier" },
    { path: "/supplier/orders", role: "supplier" },
    { path: "/supplier/quote-requests", role: "supplier" },
    { path: "/supplier/profile", role: "supplier" },
    { path: "/supplier/analytics", role: "supplier" },
    { path: "/logistics/dashboard", role: "logistics_partner" },
    { path: "/logistics/bookings", role: "logistics_partner" },
    { path: "/logistics/quotes", role: "logistics_partner" },
    { path: "/logistics/coverage", role: "logistics_partner" },
    { path: "/logistics/pricing", role: "logistics_partner" },
    { path: "/logistics/profile", role: "logistics_partner" },
    { path: "/logistics/analytics", role: "logistics_partner" },
    { path: "/admin/dashboard", role: "admin" },
    { path: "/admin/suppliers", role: "admin" },
    { path: "/admin/supplier-products", role: "admin" },
    { path: "/admin/logistics-partners", role: "admin" },
    { path: "/admin/categories", role: "admin" },
    { path: "/admin/marketplace", role: "admin" },
    { path: "/admin/settings", role: "admin" },
  ];

  for (const { path, role } of protectedPages) {
    it(`${path} redirects to login without auth cookie (${role})`, async () => {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      assert.ok(res.status === 307 || res.status === 302, `${path} should redirect (got ${res.status})`);
    });
  }
});

describe("Storefront", () => {
  it("returns 404 for unknown store slug", async () => {
    const res = await fetch(`${BASE}/s/nonexistent-store-slug`);
    assert.equal(res.status, 404);
  });

  it("checkout returns 404 for unknown store", async () => {
    const res = await fetch(`${BASE}/s/nonexistent-store-slug/checkout`);
    assert.equal(res.status, 404);
  });

  it("checkout returns 400 for empty body", async () => {
    const res = await fetch(`${BASE}/s/nonexistent-store-slug/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});
