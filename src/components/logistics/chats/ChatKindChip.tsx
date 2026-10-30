"use client";

import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";

// Who's on the other side of a delivery partner's chat: Rider / Shop / Supplier (shared/logistics-chats.ts ChatKind).

const TONE: Record<string, string> = {
  rider: "bg-app-lilac text-app-ink",
  seller: "bg-app-peach text-app-accent-ink",
  supplier: "bg-app-mint text-app-forest",
  logistics_partner: "bg-[#FDF0D5] text-[#8A5A00]",
  admin: "bg-app-canvas text-app-ink",
};

const WORD: Record<string, string> = { rider: "Rider", seller: "Shop", supplier: "Supplier", logistics_partner: "Delivery partner", admin: "Shopinbos" };

export function useChatKindLabel() {
  const t = useT("logistics");
  return (kind: string) => t.dynamic(`chats.role.${kind}`, WORD[kind] ?? WORD.seller);
}

export function ChatKindChip({ kind }: { kind: string }) {
  const label = useChatKindLabel();
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[kind] ?? TONE.seller)}>{label(kind)}</span>;
}
