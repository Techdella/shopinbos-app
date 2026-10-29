import * as ImagePicker from "expo-image-picker";
import { uploadOnePhoto, type PhotoInput } from "./upload-photo";

// Photos from the camera or the gallery, uploaded through the web's own upload route (POST /api/upload, which
// stores them in the shop's media library). Used by Rex's chat (attach photos to a message), Edit my shop (logo and
// banner pictures) and onboarding (logo, first product photo). Shrunk on the phone first (lib/upload-photo.ts).

export type PhotoSource = "camera" | "library";

/** A picked photo (ImagePicker assets fit: their size and dimensions help shrink it before sending). */
export type PickedPhoto = PhotoInput;

/** The photos picked (none when cancelled), or "denied" when the phone's permission is off. */
export async function pickPhotos(source: PhotoSource, max = 1): Promise<PickedPhoto[] | "denied"> {
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return "denied";
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: max > 1, selectionLimit: Math.max(1, max), quality: 0.7 });
  if (result.canceled) return [];
  return result.assets.slice(0, Math.max(1, max));
}

/**
 * Uploads one photo; "store-banners" for Rex and banners, "brand" for a logo (kept see-through), "products" for a
 * product. Returns its public https address.
 */
export async function uploadPhoto(photo: PickedPhoto, folder: "store-banners" | "brand" | "products" = "store-banners") {
  const data = await uploadOnePhoto<{ publicUrl: string }>("/api/upload", photo, { folder }, { base: folder === "products" ? "product" : "photo", keepTransparency: folder === "brand" });
  return data.publicUrl;
}
