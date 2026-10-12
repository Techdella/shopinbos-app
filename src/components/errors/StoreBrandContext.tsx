"use client";

import { createContext, useContext } from "react";
import type React from "react";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";

// The storefront layouts put the store's name, logo, link and colours here, so the storefront 404 and error
// pages (which get no params) can dress in the shop's own theme. Null for a slug no store uses.

export interface StoreBrandValue {
  name: string;
  logoUrl: string | null;
  basePath: string;
  theme: ShopperTheme;
}

const StoreBrandContext = createContext<StoreBrandValue | null>(null);

export function StoreBrandProvider({ value, children }: { value: StoreBrandValue | null; children: React.ReactNode }) {
  return <StoreBrandContext.Provider value={value}>{children}</StoreBrandContext.Provider>;
}

export function useStoreBrand() {
  return useContext(StoreBrandContext);
}
