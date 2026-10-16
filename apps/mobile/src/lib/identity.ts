import { useSyncExternalStore } from "react";
import type { IdentityImageKind } from "@shared/identity-images";
import { api } from "./api";

// The person's photo and their shop logo: the same API as the web's uploader (/api/app/me/images), so a picture
// changed on the phone shows on the web and the other way round. A change made in Settings is broadcast here so
// Home (which keeps its last dashboard) shows the new picture straight away.

export interface Identity {
  name: string;
  avatarUrl: string | null;
  logoUrl: string | null;
  logoLabel: string | null;
  businessName: string | null;
}

export const fetchIdentity = () => api<Identity>("/api/app/me/images");

export function uploadIdentityImage(kind: IdentityImageKind, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  form.append("kind", kind);
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `${kind}.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  return api<Identity>("/api/app/me/images", { method: "POST", body: form }).then(remember);
}

export const removeIdentityImage = (kind: IdentityImageKind) => api<Identity>(`/api/app/me/images?kind=${kind}`, { method: "DELETE" }).then(remember);

// ─── Pictures changed in this session ────────────────────────────────────────

type Changed = Partial<Pick<Identity, "avatarUrl" | "logoUrl">>;
let changed: Changed = {};
const listeners = new Set<() => void>();

function remember(identity: Identity) {
  changed = { avatarUrl: identity.avatarUrl, logoUrl: identity.logoUrl };
  listeners.forEach((listener) => listener());
  return identity;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The photo and logo as changed on this phone since the app opened (keys are missing until one changes). */
export function useChangedIdentity(): Changed {
  return useSyncExternalStore(subscribe, () => changed);
}

/** The newer of a loaded picture and one just changed on this phone. */
export function latestPicture(changedNow: Changed, key: keyof Changed, loaded: string | null | undefined) {
  return key in changedNow ? changedNow[key] ?? null : loaded ?? null;
}
