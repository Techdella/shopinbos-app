# Shopinbos Store Editor — Specification

> **Purpose of this file:** Authoritative specification for any Claude session building, extending, or debugging the Shopinbos store editor. Read this before touching a single line of code.

---

## 1. What This Is

The Shopinbos store editor is a **Shopify-style canvas editor** for the seller portal. The demo store used throughout is **AdaObi Luxury Hair** — a premium Nigerian hair extensions and wigs brand. All copy, prices, and imagery reference this store. Prices are always in **Nigerian Naira (₦)**. No other currency appears anywhere in the UI.

---

## 2. Core Design Principles

These are non-negotiable and must be respected in every change:

- **No emojis anywhere in the editor chrome.** All icons are inline SVG. Emojis may appear inside demo store content (product cards, blog posts) but never in navigation, buttons, labels, tabs, or headings of the editor itself.
- **Plain language only** for all seller-facing copy. Never say "escrow", "API", "webhook", "CRM", "SDK", or any technical jargon. Sellers are first-time entrepreneurs.
- **Nigerian Naira only** — `₦` symbol, or `&#8358;` in HTML. Never dollars, euros, pounds.
- **DM Sans / Space Grotesk** for all body and UI text. **Fraunces** for display headings and store brand names (serif, semi-bold or italic).
- **Colour palette:** Navy `#0F1F3D`, Teal `#0D9488`, Coral `#F97316`. Grays from `#F9FAFB` through `#1F2937`.
- **Start with empty state** — all page section arrays begin empty `[]`, loaded only from the API draft if it exists.

---

## 3. File Architecture

### 3.1 CSS Variable System (editor-styles.ts)

All sizing, colour, and spacing references must use these CSS variables:

```css
--navy, --navy2, --navy3          /* #0F1F3D, #1A3260, #243F78 */
--teal, --teal2, --teal3          /* #0D9488, #14B8A8, #CCFBF1 */
--coral, --coral2                 /* #F97316, #FB923C */
--g50 through --g800              /* gray scale */
--font                            /* 'DM Sans'/'Space Grotesk', sans-serif */
--serif                           /* 'Fraunces', serif */
--r, --r2, --r3                   /* border-radius: 8px, 4px, 12px */
--sh, --shm, --shl                /* box-shadow levels */
--topH: 52px                      /* topbar height */
--sbW: 264px                      /* left sidebar width */
--rpW: 300px                      /* right panel width */
```

Never hardcode hex values that duplicate these.

### 3.2 CSS Prefix Discipline

| Prefix | Domain | Example |
|--------|--------|---------|
| `s-*` | Live store preview styles (inside the canvas) | `.s-nav`, `.s-hero`, `.s-card` |
| All other classes | Editor chrome (topbar, sidebars, panels, modals, Rex AI) | `.rps`, `.sec-wrap`, `.tb-dev`, `.rp-tab` |

**Never apply `s-*` classes to editor chrome elements.**

### 3.3 Pages Data

```ts
const DEFAULT_PAGES = {
  homepage: { title: 'Homepage', secs: [] },
  shop:     { title: 'Shop', secs: [] },
  product:  { title: 'Product Page', secs: [] },
  about:    { title: 'About Us', secs: [] },
  contact:  { title: 'Contact', secs: [] },
  blog:     { title: 'Blog', secs: [] },
};
```

All sections arrays start empty. Sections are loaded from `GET /api/store/editor` draft data (`draft.sbi_pages`).

### 3.4 Sections Registry (SEC)

Every renderable section is a function in `makeSec(storeName, storeProducts)` that returns an HTML string. Rules:

- **Pure functions** — return self-contained HTML strings
- **No emojis** — use `.img-ph` divs with inline SVG for image placeholders
- All store products come from the API (`storeProducts` array)
- Placeholder product cards shown when `storeProducts` is empty

### 3.5 Section Labels

```ts
const SEC_LABELS = {
  nav: "Navigation", hero: "Hero Banner", trust: "Trust Bar",
  products: "Products", banner: "Promo Banner", reviews: "Reviews",
  newsletter: "Newsletter", footer: "Footer", ...
};
```

---

## 4. Canvas System

### 4.1 Empty State

When a page has zero sections, the canvas shows three action cards:
- **Add blocks** → opens Elements panel in sidebar
- **Ask Rex AI** → opens Rex panel
- **Browse themes** → navigates to `/seller/store/templates`

### 4.2 Section Selection

Clicking a `.sec-wrap` selects the section. The `.sec-bar` action bar appears above. The right panel updates to show section content settings.

### 4.3 Section Action Bar (`.sec-bar`)

| Button | Action |
|--------|--------|
| Move Up | Swap with previous section |
| Move Down | Swap with next section |
| Duplicate | Insert copy after current |
| Design | Switch right panel to Design tab |
| Delete | Remove from page sections |

All buttons call `e.stopPropagation()`.

### 4.4 Add-Between Dividers

Between every pair of sections sits an `.add-between` div. The `+` button opens the section picker modal with `insertAfterSec` set.

### 4.5 Device Switcher

Three device buttons: Desktop / Tablet / Mobile. Apply `.tablet` or `.mobile` class to the canvas frame.

### 4.6 Zoom

Zoom 25–200%, applied via `transform: scale()` with `transform-origin: top center`.

---

## 5. Left Sidebar

### 5.1 Tab System

Three tabs: **Pages**, **Elements**, **Layers**.

### 5.2 Pages Tab

Page list rows with icon, name, status ("Live" vs "Draft"), and `⋯` overflow button. Blog CMS row at the bottom. `+` button to add new page.

### 5.3 Elements Tab

Searchable grid of draggable elements:
- **Store:** Navigation, Hero, Trust Bar, Products, Banner, Reviews, Newsletter, Footer
- **Blocks:** Features, Gallery, Text, Image, Columns, Button, Divider, Spacer
- **Commerce:** Add to Cart, Countdown, Stars
- **Social:** WhatsApp

### 5.4 Layers Tab

One row per section in the current page. Clicking a layer selects that section.

---

## 6. Right Panel

### 6.1 Tab Routing

- **Content tab:** section-specific form fields
- **Design tab:** background, typography, spacing
- **SEO tab:** meta title, description, keywords, live preview

### 6.2 Form Control Patterns

| Control | Class | Usage |
|---------|-------|-------|
| Text input | `.ri` | Single-line field |
| Textarea | `.rtx` | Multi-line content |
| Select | `.rsel` | Option picker |
| Button group | `.rbg` / `.rbgb` | Mutually exclusive options |
| Range slider | `.rr` with `.rr-v` | Numeric values |
| Colour row | `.rcsw` swatch + `.ri` input | Colour picker |

---

## 7. API Integration

### 7.1 Load

```
GET /api/store/editor
→ { data: { store: { name, slug, storeProducts }, draft } }
```

Restore sections from `draft.sbi_pages` if it exists.

### 7.2 Save

```
PATCH /api/store/editor
Body: { snapshot: { sbi_pages: { [pageKey]: string[] }, storeName, savedAt } }
```

### 7.3 Publish

```
POST /api/store/editor/publish
```

---

## 8. Preview Screen

Full-screen overlay showing the current page without editor chrome. Sections rendered without `.sec-wrap` wrappers or action bars. Back button returns to editor.

---

## 9. Blog CMS Screen

Full-screen overlay with:
- Left sidebar: post list with status badges (Published / Draft)
- Right area: post editor with title, meta row, featured image upload zone, formatting toolbar, content textarea, SEO card

---

## 10. Rex AI Panel

### 10.1 Trigger

- Fixed bottom-right circular button, hidden when panel is open
- `initialRexOpen` prop opens it on mount (used when navigating from "Build with Rex" on `/seller/store`)

### 10.2 Panel Structure

```
┌─────────────────────────────────────────┐
│ Rex header (navy, avatar, name, close)  │
├─────────────────────────────────────────┤
│ Message thread (rexMsgs)                │
│  - AI messages: left, gray bg          │
│  - User messages: right, navy          │
│  - Typing indicator (3 animated dots)  │
├─────────────────────────────────────────┤
│ Quick action chips                      │
├─────────────────────────────────────────┤
│ Input (textarea + send button)          │
└─────────────────────────────────────────┘
```

### 10.3 API Call

```
POST /api/ai/store-editor
Body: { messages: [{ role, content }], context: { storeName, page, selectedSection } }
```

### 10.4 Error Handling

Network errors render: "Sorry, I could not connect right now. Please try again." No stack traces exposed. `rexBusy` prevents concurrent requests.

---

## 11. Modals

### 11.1 New Page Modal

Fields: page name input, start-from select (Blank / Copy of Homepage). `createPage()` adds to pages state and switches to the new page.

### 11.2 Section Picker Modal

Grid of all section types, grouped by category. Clicking adds the section after `insertAfterSec`.

### 11.3 Publish Modal

3-step progress: Build → Deploy → Live. Shows store URL with copy button after publish.

### 11.4 Context Menu

Right-click on section shows: Move Up, Move Down, Duplicate, Edit Design, Delete.

---

## 12. Save State

Auto-save indicator in canvas bar. Saved state: teal dot + "Saved". Unsaved: coral dot + "Unsaved changes". `doSave()` debounced after data mutations.

---

## 13. Common Bugs and How to Avoid Them

| Bug | Cause | Prevention |
|-----|-------|------------|
| SEC section renders wrong | SEC ID has suffix `_1234` from duplicate | Always strip suffix with `.replace(/_\d+$/, "")` before looking up SEC |
| Canvas click selects wrong section | Event bubbles from inner elements | Use `e.stopPropagation()` on all section action bar buttons |
| Rex sends on Enter + Shift | Missing shiftKey check | `if (e.key === "Enter" && !e.shiftKey)` |
| Sections load order wrong on restore | `Object.entries` key order | Always preserve insertion order; never rely on object key ordering for sections |
| Right panel shows wrong section after add | Stale `sel` state | `setSel(newSecId)` after adding, not before |

---

## 14. Dos and Don'ts

**Do:**
- Write all section HTML in `makeSec()` as functions returning template literals
- Use `s-*` prefix for all store preview CSS classes
- Keep section IDs unique by appending `_${Date.now()}` on duplicate
- Call `doSave()` after any data mutation
- Strip `_\d+$` suffix from section IDs when looking up SEC, labels, and RP content

**Don't:**
- Use emojis in editor chrome elements
- Hardcode any colour hex value that has a CSS variable equivalent
- Show technical error messages to the user
- Start pages with pre-filled sections — always empty state, loaded from API
- Use `localStorage` or any client-side persistence — use the API

---

## 15. Brand Voice for Rex AI

Rex speaks as a knowledgeable, warm Nigerian business advisor:
- Plain English, no jargon
- References Nigerian cities and contexts
- Prices always in ₦ with comma-formatted thousands (₦85,000 not N85000)
- Never says "API", "CRM", "webhook", "escrow"
- Gives specific, actionable suggestions

---

*Spec version: derived from Shopinbos Seller Portal standalone prototype + Next.js implementation*
