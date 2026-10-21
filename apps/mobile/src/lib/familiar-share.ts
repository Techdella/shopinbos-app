import { Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";

// "Share now" for a design from Rex or a status (decision 3: we never post for anyone). The picture is downloaded to
// the phone's cache (expo-file-system) and handed to the phone's own share sheet (expo-sharing), so the person picks
// WhatsApp, Instagram, TikTok or Facebook there. The caption is copied first, ready to paste. WhatsApp chats open
// WhatsApp straight away with the caption and the picture's link. Both native modules are loaded only when used, so
// an older app build without them falls back to the plain share sheet instead of crashing.

export type ShareTarget = "whatsapp_status" | "whatsapp_chat" | "tiktok" | "instagram" | "facebook" | "save";

export const SHARE_TARGETS: ShareTarget[] = ["whatsapp_status", "whatsapp_chat", "tiktok", "instagram", "facebook", "save"];

/** "picture.jpg" from a URL, so the share sheet shows a sensible name and type. */
function fileName(url: string) {
  const last = url.split(/[?#]/)[0].split("/").pop() ?? "";
  const clean = last.replace(/[^\w.-]/g, "");
  return /\.(jpe?g|png|webp|gif|mp4|mov)$/i.test(clean) ? clean : `shopinbos-${Date.now()}.jpg`;
}

function mimeOf(name: string) {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.(mp4|mov)$/i.test(name)) return "video/mp4";
  return "image/jpeg";
}

/** The picture saved in the phone's cache, or null (offline, no file system in this build, a bad link). */
export async function downloadToCache(url: string): Promise<{ uri: string; mimeType: string } | null> {
  if (!url || Platform.OS === "web") return null;
  try {
    const fs = await import("expo-file-system");
    const name = fileName(url);
    const file = await fs.File.downloadFileAsync(url, new fs.File(fs.Paths.cache, name), { idempotent: true });
    return { uri: file.uri, mimeType: mimeOf(name) };
  } catch {
    return null;
  }
}

/** The phone's share sheet with the picture file; the plain text share sheet when that can't be done. */
async function shareSheet(imageUrl: string | null, caption: string, title: string): Promise<boolean> {
  if (imageUrl) {
    const local = await downloadToCache(imageUrl);
    if (local) {
      try {
        const sharing = await import("expo-sharing");
        if (await sharing.isAvailableAsync()) {
          await sharing.shareAsync(local.uri, { mimeType: local.mimeType, dialogTitle: title, UTI: local.mimeType === "image/png" ? "public.png" : "public.jpeg" });
          return true;
        }
      } catch {
        // No sharing module in this build: the share sheet below (iOS still attaches the file).
      }
      if (Platform.OS === "ios") {
        const result = await Share.share({ url: local.uri, message: caption }).catch(() => null);
        return Boolean(result && result.action !== Share.dismissedAction);
      }
    }
  }
  const message = imageUrl ? `${caption}\n${imageUrl}`.trim() : caption;
  const result = await Share.share({ message, title }).catch(() => null);
  return Boolean(result && result.action !== Share.dismissedAction);
}

/**
 * Shares a design or status. Returns true when it went somewhere (or WhatsApp opened). The caption is on the
 * clipboard either way, because Instagram, TikTok and WhatsApp Status don't take text from the share sheet.
 */
export async function sharePost(input: { imageUrl: string | null; caption: string; target: ShareTarget; title: string }): Promise<boolean> {
  const caption = input.caption.trim();
  if (caption) await Clipboard.setStringAsync(caption).catch(() => null);
  if (input.target === "whatsapp_chat") {
    const text = [caption, input.imageUrl].filter(Boolean).join("\n");
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`);
      return true;
    } catch {
      // WhatsApp isn't on this phone: the share sheet instead.
    }
  }
  return shareSheet(input.imageUrl, caption, input.title);
}
