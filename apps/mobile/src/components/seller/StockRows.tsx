import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Row, Stepper } from "@/components/design";
import { Thumb } from "@/components/seller/bits";
import { CodeBadge, ShareProductIcon } from "@/components/seller/ProductCode";
import { T } from "@/components/ui";
import type { ProductItem } from "@/lib/dashboard";
import { saveProduct } from "@/lib/products";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Products with − and + to change the stock when the seller sells or restocks (Products and My shop): each
// product's newest count waits a moment (the seller may tap a few times), then saves once (PATCH
// /api/store/products/[id] { currentStock }); a failed save puts the old count back. Dropship products show the
// supplier's stock words but no steppers.

const SAVE_AFTER_MS = 700;

type SetProducts = Dispatch<SetStateAction<ProductItem[] | null>>;

export function useStockSaver(setProducts: SetProducts, onError: (message: string) => void) {
  const t = useT("m_products");
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, { next: number; before: number }>());

  const flush = useCallback(
    (id: string) => {
      const change = pending.current.get(id);
      timers.current.delete(id);
      pending.current.delete(id);
      if (!change) return;
      saveProduct(id, { currentStock: change.next }).catch((saveError) => {
        setProducts((current) => current?.map((row) => (row.id === id ? { ...row, currentStock: change.before } : row)) ?? current);
        onError(saveError instanceof Error ? saveError.message : t("list.stockFailed"));
      });
    },
    [t, setProducts, onError],
  );

  // Leaving the screen sends any change still waiting.
  useEffect(() => {
    const waiting = timers.current;
    const changes = pending.current;
    return () => {
      waiting.forEach((timer) => clearTimeout(timer));
      changes.forEach((change, id) => void saveProduct(id, { currentStock: change.next }).catch(() => null));
      changes.clear();
    };
  }, []);

  return function setStock(product: ProductItem, next: number) {
    const before = pending.current.get(product.id)?.before ?? product.currentStock;
    pending.current.set(product.id, { next, before });
    setProducts((current) => current?.map((row) => (row.id === product.id ? { ...row, currentStock: next } : row)) ?? current);
    const waiting = timers.current.get(product.id);
    if (waiting) clearTimeout(waiting);
    timers.current.set(product.id, setTimeout(() => flush(product.id), SAVE_AFTER_MS));
  };
}

/** One product row: picture, name, price and stock words, the stepper under them; tap opens the product. */
export function StockRow({ product, onStock }: { product: ProductItem; onStock: (product: ProductItem, next: number) => void }) {
  const t = useT("m_products", "common");
  const own = !product.inventoryType || product.inventoryType === "seller";
  const low = product.currentStock <= (product.lowStockThreshold ?? 3);
  const stock = product.currentStock <= 0 ? t("list.soldOut") : low ? t("list.runningLow", { count: product.currentStock }) : t("drafts.inStock", { count: product.currentStock });
  const words = [naira(Number(product.retailPrice)), stock, product.status !== "published" ? t("status.draft") : null].filter(Boolean).join(" · ");
  return (
    <Row
      lead={<Thumb uri={product.images[0]} fallback={product.name} />}
      title={product.name}
      sub={
        // The stepper sits under the name and price, so both get the row's full width.
        <View style={{ gap: 8 }}>
          {product.shortCode ? <CodeBadge code={product.shortCode} /> : null}
          <T style={{ fontSize: 14, lineHeight: 19, color: low && own ? colors.accentInk : colors.inkSoft }}>{words}</T>
          {own ? <Stepper value={product.currentStock} label={product.name} onChange={(next) => onStock(product, next)} /> : null}
        </View>
      }
      // Share to WhatsApp (live products: the link opens their page).
      right={product.status === "published" && product.url ? <ShareProductIcon product={product} /> : undefined}
      accessibilityLabel={`${product.name}. ${product.shortCode ? `${product.shortCode}. ` : ""}${words}`}
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
    />
  );
}
