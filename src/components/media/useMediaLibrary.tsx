"use client";

import { useCallback, useRef, useState } from "react";
import { MediaLibraryDialog } from "./MediaLibraryDialog";
import type { MediaAssetView } from "./media-client";

export interface MediaLibraryOptions {
  multiple?: boolean;
  /** "image" (default) or "any" (pictures and videos). */
  accept?: "image" | "any";
  title?: string;
}

/**
 * "Add photo" buttons open the seller's media library first (it has its own Upload button), so pictures already
 * saved, made by Rex or used on products are one tap away. `open()` resolves with the chosen items (empty when
 * closed); render `dialog` somewhere in the component.
 */
export function useMediaLibrary() {
  const [options, setOptions] = useState<MediaLibraryOptions | null>(null);
  const resolver = useRef<((assets: MediaAssetView[]) => void) | null>(null);

  const open = useCallback((next: MediaLibraryOptions = {}) => {
    resolver.current?.([]);
    return new Promise<MediaAssetView[]>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const settle = useCallback((assets: MediaAssetView[]) => {
    resolver.current?.(assets);
    resolver.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <MediaLibraryDialog
      open={options !== null}
      multiple={options?.multiple}
      accept={options?.accept}
      title={options?.title}
      onClose={() => settle([])}
      onSelect={(assets) => settle(assets)}
    />
  );
  return { open, dialog };
}

/** A library video as a File (for features that read frames from it, like Rex's video context). */
export async function mediaFile(asset: MediaAssetView): Promise<File> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error("That file couldn't be opened.");
  const blob = await response.blob();
  const name = asset.name || asset.url.split("/").pop() || (asset.kind === "video" ? "video.mp4" : "photo.jpg");
  return new File([blob], name, { type: blob.type || (asset.kind === "video" ? "video/mp4" : "image/jpeg") });
}
