import * as ImagePicker from "expo-image-picker";
import { api } from "./api";

// Photos from the camera or the gallery, uploaded through the web's own upload route (POST /api/upload, which
// stores them in the shop's media library). Used by Rex's chat (attach photos to a message) and Edit my shop
// (logo and banner pictures).

export type PhotoSource = "camera" | "library";

export interface PickedPhoto {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

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

/** Uploads one photo; "store-banners" for Rex and banners, "brand" for a logo. Returns its public https address. */
export async function uploadPhoto(photo: PickedPhoto, folder: "store-banners" | "brand" | "products" = "store-banners") {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `photo.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  form.append("folder", folder);
  const data = await api<{ publicUrl: string }>("/api/upload", { method: "POST", body: form });
  return data.publicUrl;
}
