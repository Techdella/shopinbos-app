import { Share } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { fetchSetup, patchSetup } from "./setup";

/** "Share my shop": the phone's share sheet with the shop link. Counts towards "Share your shop link" on Start here. */
export async function shareShop(): Promise<"shared" | "dismissed" | "no-link"> {
  const overview = await fetchSetup().catch(() => null);
  const url = overview?.store.url;
  if (!url) return "no-link";
  const result = await Share.share({ message: `Shop with ${overview.store.name}: ${url}` }).catch(() => null);
  if (result && result.action !== Share.dismissedAction) {
    void patchSetup({ type: "shared" }).catch(() => null);
    return "shared";
  }
  return "dismissed";
}

export function openShop(url: string) {
  return WebBrowser.openBrowserAsync(url);
}
