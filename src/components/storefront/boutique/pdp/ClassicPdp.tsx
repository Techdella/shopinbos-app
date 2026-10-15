"use client";

import type { BoutiqueProductViewProps } from "../BoutiqueProductView";
import { BOUTIQUE_CSS, lookVars } from "../look";
import { BoutiquePdp } from "./BoutiquePdp";
import type { PdpSettings } from "./pdp-logic";

type Props = BoutiqueProductViewProps & { settings: PdpSettings; className?: string };

/**
 * The shared product page inside a classic template (live product route and the classic builder preview). The `.bq`
 * root gives it the container queries and theme variables BoutiquePdp is styled with; `look` comes from classicLook().
 */
export function ClassicPdp({ className, ...props }: Props) {
  return (
    <div className={`bq ${className ?? ""}`} data-classic-pdp="" style={{ ...lookVars(props.look), minHeight: 0 }}>
      <style>{BOUTIQUE_CSS}</style>
      <BoutiquePdp key={props.product.id} {...props} />
    </div>
  );
}
