import type { TFunction } from "@shared/i18n";

// sellerWholesaleStage (lib/supplier-orders/pure) answers in English; this puts its label and note in the
// reader's language, keeping the English text when a key is missing.
export function localWholesaleStage<S extends { label: string; note: string | null }>(t: Pick<TFunction, "dynamic">, stage: S): S {
  const label = t.dynamic(`ws.stage.${stage.label}`, stage.label);
  let note = stage.note;
  if (note === "Nothing was paid. Find another supplier for it.") note = t.dynamic("ws.note.expired", note);
  else if (note?.startsWith("Your reason: ")) note = t.dynamic("ws.note.yourReason", note, { reason: note.slice("Your reason: ".length) });
  else if (note?.startsWith("Declined: ")) note = t.dynamic("ws.note.declined", note, { reason: note.slice("Declined: ".length) });
  return { ...stage, label, note };
}
