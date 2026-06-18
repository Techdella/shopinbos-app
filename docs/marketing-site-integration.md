# Shopinbos Marketing Site Integration

Use the Shopinbos app as the marketplace source of truth. The marketing website should only read from public endpoints and should send action CTAs back into the app for sign in, sign up, and authenticated completion.

## Base URLs

Production:

```txt
https://app.shopinbos.com/api/v1/public
```

Local app:

```txt
http://localhost:3000/api/v1/public
```

Legacy clients can still call `/api/public`, but new marketing work should use `/api/v1/public`.

## Read Rules

- Use `GET` only for public marketplace data.
- Do not write marketplace records from WordPress or the marketing site.
- Do not store private user, quote, order, bank, contact, or verification data on the marketing site.
- Respect the cache headers returned by the API.
- Use CTA links into the app for actions such as add product, request quote, book delivery, and supplier onboarding.

## Fetch Helpers

```js
const SHOPINBOS_API = "https://app.shopinbos.com/api/v1/public";

async function shopinbosFetch(path, params = {}) {
  const url = new URL(`${SHOPINBOS_API}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Shopinbos API returned ${response.status}`);
  }

  return response.json();
}
```

## Product Sections

Trending products:

```js
const trending = await shopinbosFetch("/products/trending", { limit: 12 });
```

Category products:

```js
const beauty = await shopinbosFetch("/products/category/beauty-skincare", {
  page: 1,
  limit: 12,
  sort: "trending",
});
```

Search products:

```js
const results = await shopinbosFetch("/products/search", {
  q: "ankara",
  page: 1,
  limit: 20,
});
```

Product detail:

```js
const product = await shopinbosFetch("/products/ankara-fabric-bundle");
```

## Supplier Sections

Supplier directory:

```js
const suppliers = await shopinbosFetch("/suppliers", {
  country: "Nigeria",
  city: "Lagos",
  sort: "trust_score",
  limit: 20,
});
```

Supplier detail:

```js
const supplier = await shopinbosFetch("/suppliers/lagos-beauty-wholesale");
```

## Logistics Sections

Logistics directory:

```js
const partners = await shopinbosFetch("/logistics/partners", {
  country: "Nigeria",
  city: "Lagos",
  sort: "reliability",
  limit: 20,
});
```

Find partners by zone:

```js
const ikejaPartners = await shopinbosFetch("/logistics/partners", {
  zone: "Ikeja",
  vehicleType: "Bike",
});
```

## Categories

```js
const categories = await shopinbosFetch("/categories", { rootOnly: true });
```

## CTA Links Back Into The App

Build CTAs with intent parameters and let the app continue the action after authentication.

```js
const APP_URL = "https://app.shopinbos.com";

function shopinbosAppLink(path, params = {}) {
  const url = new URL(path, APP_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("source", "wordpress");
  return url.toString();
}
```

Seller product actions:

```js
const addToStoreUrl = shopinbosAppLink("/signup", {
  intent: "add",
  productSlug: "ankara-fabric-bundle",
});

const dropshipUrl = shopinbosAppLink("/login", {
  intent: "dropship",
  productSlug: "ankara-fabric-bundle",
});

const quoteUrl = shopinbosAppLink("/login", {
  intent: "request_quote",
  productSlug: "ankara-fabric-bundle",
  supplierSlug: "lagos-beauty-wholesale",
});
```

Supplier actions:

```js
const supplierProductsUrl = shopinbosAppLink("/supplier/login", {
  intent: "view_products",
  supplierSlug: "lagos-beauty-wholesale",
});

const supplierSignupUrl = shopinbosAppLink("/supplier/signup", {
  intent: "view_products",
  supplierSlug: "lagos-beauty-wholesale",
});
```

Logistics actions:

```js
const bookDeliveryUrl = shopinbosAppLink("/login", {
  intent: "book_delivery",
  logisticsSlug: "swiftlane-logistics",
});

const logisticsPartnerUrl = shopinbosAppLink("/logistics/signup", {
  intent: "connect_logistics",
  logisticsSlug: "swiftlane-logistics",
});
```

## Rendering Notes

- Use product `slug` for detail links and CTA parameters.
- Use supplier `slug` for supplier detail and supplier quote CTAs.
- Use logistics partner `slug` for logistics detail and delivery CTAs.
- Show empty states when `data` is empty.
- Hide action buttons if the required slug is missing.
- Treat all public responses as read-only snapshots.

