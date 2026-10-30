"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { ShopperShell, fieldClass } from "@/components/storefront/shopper/ShopperShell";
import { resolveShopperTheme, type ShopperTheme } from "@/components/storefront/shopper/theme";
import { readSavedDetails } from "@/components/storefront/shopper/checkout-storage";
import type { PublicStore } from "@/lib/storefront/public-store.server";

// Bits the "other ways to buy" pages share (Pay small small, ajo, group buy). Storefront text is English.

export type TogetherStore = Pick<PublicStore, "name" | "slug" | "logoUrl" | "brandSettings" | "currency">;

export function useTheme(store: TogetherStore) {
  return useMemo(() => resolveShopperTheme(store.brandSettings), [store.brandSettings]);
}

export function Shell({ store, theme, basePath, title, children }: { store: TogetherStore; theme: ShopperTheme; basePath: string; title: string; children: React.ReactNode }) {
  return (
    <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} brandSettings={store.brandSettings} basePath={basePath} title={title} footPayments={false}>
      <div className="mx-auto w-full max-w-[600px] px-4 py-8 sm:px-0">{children}</div>
    </ShopperShell>
  );
}

/** ₦12,500 from kobo (whole naira; parts are whole naira). */
export function nairaText(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

export function dayLabel(value: string | Date) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+01:00`) : new Date(value);
  return date.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

export type Answer<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** POST to the storefront's /together API. */
export async function postTogether<T = { authorizationUrl: string }>(slug: string, body: Record<string, unknown>): Promise<Answer<T>> {
  try {
    const response = await fetch(`/api/public/store/${encodeURIComponent(slug)}/together`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
    if (!response.ok || !json?.data) return { ok: false, code: json?.error?.code ?? String(response.status), message: json?.error?.message ?? "Something went wrong. Try again." };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, code: "NETWORK", message: "No connection. Check your internet and try again." };
  }
}

/** Sends the shopper to Paystack (the payment is split to the seller there). */
export function goToPaystack(url: string) {
  window.location.assign(url);
}

export interface Details {
  name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  landmark: string;
}

/** The buyer's details, prefilled (after the first render) from what this browser saved at checkout. */
export function useDetails(slug: string) {
  const state = useState<Details>({ name: "", phone: "", email: "", street: "", city: "", state: "", landmark: "" });
  const setDetails = state[1];
  useEffect(() => {
    const saved = readSavedDetails(slug);
    setDetails((current) => ({
      name: current.name || saved.name || "",
      phone: current.phone || saved.phone || "",
      email: current.email || saved.email || "",
      street: current.street || saved.street || "",
      city: current.city || saved.city || "",
      state: current.state || saved.state || "",
      landmark: current.landmark || saved.landmark || "",
    }));
  }, [slug, setDetails]);
  return state;
}

export function detailsBody(details: Details) {
  return {
    buyerName: details.name.trim(),
    buyerPhone: details.phone.trim(),
    buyerEmail: details.email.trim(),
    address: { street: details.street.trim(), city: details.city.trim(), state: details.state.trim() || undefined, landmark: details.landmark.trim() || undefined },
  };
}

export function DetailsFields({ theme, details, onChange, addressNote }: { theme: ShopperTheme; details: Details; onChange: (next: Details) => void; addressNote?: string }) {
  const field = (key: keyof Details, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-[14px] font-semibold">
      {label}
      <input {...props} value={details[key]} onChange={(event) => onChange({ ...details, [key]: event.target.value })} className={fieldClass} style={{ borderColor: theme.border, color: theme.ink }} />
    </label>
  );
  return (
    <div className="grid gap-3">
      {field("name", "Full name", { autoComplete: "name", required: true })}
      {field("phone", "Phone number", { autoComplete: "tel", inputMode: "tel", required: true })}
      {field("email", "Email", { autoComplete: "email", inputMode: "email", type: "email", required: true })}
      <p className="m-0 mt-1 text-[13px]" style={{ color: theme.muted }}>{addressNote ?? "Where should it be delivered?"}</p>
      {field("street", "Street address", { autoComplete: "street-address", required: true })}
      <div className="grid grid-cols-2 gap-3">
        {field("city", "Area or city", { autoComplete: "address-level2", required: true })}
        {field("state", "State", { autoComplete: "address-level1" })}
      </div>
      {field("landmark", "Landmark (optional)")}
    </div>
  );
}

export function Notice({ theme, tone, children }: { theme: ShopperTheme; tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const colour = tone === "error" ? "#B42318" : tone === "success" ? "#1F7A4D" : theme.ink;
  return (
    <p role={tone === "error" ? "alert" : "status"} className="m-0 rounded-[12px] border px-4 py-3 text-[14px]" style={{ borderColor: theme.border, color: colour, background: theme.surface }}>
      {children}
    </p>
  );
}

export function Check({ theme, checked, onChange, children }: { theme: ShopperTheme; checked: boolean; onChange: (next: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.5]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" style={{ accentColor: theme.cta }} />
      <span>{children}</span>
    </label>
  );
}

/** The "payment back from Paystack" line at the top of a page. */
export function ReturnNotice({ theme, returned, paidText }: { theme: ShopperTheme; returned: string | null; paidText: string }) {
  if (!returned) return null;
  if (returned === "paid") return <Notice theme={theme} tone="success">{paidText}</Notice>;
  if (returned === "pending") return <Notice theme={theme} tone="info">Your payment is still being confirmed. Refresh this page in a minute.</Notice>;
  return <Notice theme={theme} tone="error">The payment didn't go through. You weren't charged; try again.</Notice>;
}
