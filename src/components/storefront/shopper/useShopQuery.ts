"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_SHOP_QUERY, parseShopQuery, shopQueryParams, type ShopQuery } from "./shop-browse";

type Next = ShopQuery | ((previous: ShopQuery) => ShopQuery);

function addressFor(query: ShopQuery) {
  const params = shopQueryParams(query, window.location.search).toString();
  return `${window.location.pathname}${params ? `?${params}` : ""}${window.location.hash}`;
}

/**
 * The shop page's filters, kept in the address on a live store: read on load and on Back/Forward, written whenever
 * they change on the shop page. `update(next, "push")` adds a history entry (a category, a checkbox), so Back undoes
 * it; typing a price replaces the entry instead. The builder preview keeps them in memory only.
 */
export function useShopQuery({ live, onShopPage, initial }: { live: boolean; onShopPage: boolean; initial?: Partial<ShopQuery> }) {
  const [query, setQuery] = useState<ShopQuery>(() => ({ ...EMPTY_SHOP_QUERY, ...initial }));
  const latest = useRef(query);
  latest.current = query;
  // Until the address has been read, nothing is written back (that would wipe a shared link's filters).
  const [ready, setReady] = useState(!live);
  const onShop = useRef(onShopPage);
  onShop.current = onShopPage;

  useEffect(() => {
    if (!live) return;
    const read = () => {
      const next = { ...parseShopQuery(window.location.search), q: latest.current.q };
      latest.current = next;
      setQuery(next);
    };
    read();
    setReady(true);
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [live]);

  useEffect(() => {
    if (!live || !ready || !onShopPage) return;
    const next = addressFor(query);
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
  }, [live, ready, onShopPage, query]);

  const update = useCallback(
    (next: Next, how: "push" | "replace" = "replace") => {
      const value = typeof next === "function" ? next(latest.current) : next;
      if (live && how === "push" && onShop.current) {
        const address = addressFor(value);
        if (address !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.pushState(window.history.state, "", address);
      }
      latest.current = value;
      setQuery(value);
    },
    [live],
  );

  return { query, update };
}
