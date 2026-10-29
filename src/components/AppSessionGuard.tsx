"use client";

import { useEffect } from "react";
import { isDigitalPurchasePath } from "@shared/store-payments";

// Only rendered on pages the phone app opened (src/lib/app-session.ts). Hides every link to a page that sells plans,
// credits, themes or top-ups (shared/store-payments.ts), including ones added later or rendered after load, and
// stops a click on one that slips through. Buttons that buy without a link carry data-purchase (globals.css).

function hidePurchaseLinks(root: ParentNode) {
  for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (!link.hasAttribute("data-purchase") && isDigitalPurchasePath(link.getAttribute("href") ?? "")) link.setAttribute("data-purchase", "");
  }
}

export function AppSessionGuard() {
  useEffect(() => {
    hidePurchaseLinks(document);
    const observer = new MutationObserver(() => hidePurchaseLinks(document));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (link && isDigitalPurchasePath(link.getAttribute("href") ?? "")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
