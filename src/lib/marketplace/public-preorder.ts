import { preorderState } from "../../../shared/preorder.ts";

// Preorders in the public marketplace API (/api/public/products…, read by shopinbos.com): each product gets
// `preorder` ({ open, shipsOn, left, note }, or null) and never the supplier's raw counts. Pure, so tests can load it.

/** Add to a SupplierProduct select so `withPublicPreorder` can shape the row. */
export const PUBLIC_PREORDER_SELECT = { preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true } as const;

type PreorderColumns = { preorderEnabled: boolean; preorderShipsAt: Date | null; preorderLimit: number | null; preorderTaken: number; preorderNote: string | null };

export interface PublicPreorder {
  /** Shops can preorder now (not full). */
  open: boolean;
  /** Ships from (YYYY-MM-DD), or null for "when it arrives". */
  shipsOn: string | null;
  /** Places left under the supplier's cap; null when there is no cap. */
  left: number | null;
  /** The supplier's promise to shops. */
  note: string | null;
}

export function withPublicPreorder<T extends PreorderColumns>(row: T): Omit<T, keyof PreorderColumns> & { preorder: PublicPreorder | null } {
  const { preorderEnabled, preorderShipsAt, preorderLimit, preorderTaken, preorderNote, ...rest } = row;
  const state = preorderState({ enabled: preorderEnabled, shipsAt: preorderShipsAt, limit: preorderLimit, taken: preorderTaken, note: preorderNote });
  return { ...rest, preorder: state.on ? { open: state.open, shipsOn: state.shipsOn, left: state.left, note: state.note } : null };
}
