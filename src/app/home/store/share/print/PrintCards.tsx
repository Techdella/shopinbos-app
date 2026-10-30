"use client";

import { ShopShareCard, type ShopCardSize, type ShopShareCardProps } from "@/components/shop-link/ShopShareCard";

/** `count` copies of the shop card in the print sheet's grid. */
export function PrintCards({ size, count, card, plug = false }: { size: Exclude<ShopCardSize, "screen">; count: number; card: Omit<ShopShareCardProps, "size" | "plug">; plug?: boolean }) {
  return (
    <div className={size === "flyer" ? "shop-sheet-flyer bg-white" : "shop-sheet-sticker bg-white"}>
      {Array.from({ length: count }, (_, index) => (
        <ShopShareCard key={index} {...card} size={size} plug={plug} />
      ))}
    </div>
  );
}
