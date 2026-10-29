import "server-only";

import { channelCards } from "./server";
import { PLATFORM_NAME, type LivePlatform } from "./pure";

// Where a product sells, for the product form's "Visibility and channels" tab: the store's own website plus the
// Sell everywhere platforms this server can connect (WhatsApp catalog, Facebook & Instagram, Google). Connected ones
// sync every live product by themselves, so there is nothing to tick per product.

export interface ProductChannelView {
  platform: LivePlatform;
  name: string;
  connected: boolean;
}

export async function productChannels(storeId: string): Promise<ProductChannelView[]> {
  const { cards } = await channelCards(storeId).catch(() => ({ cards: [] }));
  return cards
    .filter((card) => card.state.kind !== "soon")
    .map((card) => ({ platform: card.platform, name: PLATFORM_NAME[card.platform], connected: card.state.kind === "connected" || card.state.kind === "syncing" }));
}
