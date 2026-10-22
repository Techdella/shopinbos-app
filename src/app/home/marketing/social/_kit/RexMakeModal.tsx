"use client";

import { useCallback } from "react";
import { Modal } from "@/components/growth/Modal";
import { confirmDialog } from "@/components/ui/dialogs";
import { useT } from "@/components/i18n/I18nProvider";
import { ImageGenClient } from "@/app/studio/images/ImageGenClient";
import { VideoStudio } from "@/app/home/video/VideoStudio";
import type { PostFormat } from "@/lib/social-posts/pure";
import type { MadeDesign, RexMakerData } from "./types";

// Rex's picture maker and the reel maker in a pop-up on Social posts (the real components, not an iframe), so
// sellers make a design at the post's size and drop it into the post without leaving the page.

/** Rex makes square, landscape and tall pictures; the post crops them to its exact size. */
const IMAGE_SIZE: Record<PostFormat, "1024x1024" | "1792x1024" | "1024x1792"> = { square: "1024x1024", portrait: "1024x1792", story: "1024x1792", landscape: "1792x1024" };

export type RexMakeKind = "image" | "reel";

export function RexMakeModal({ kind, format, data, onUse, onClose }: { kind: RexMakeKind; format: PostFormat; data: RexMakerData; onUse: (design: MadeDesign) => void; onClose: () => void }) {
  const t = useT("socialPosts");
  // Pictures Rex makes are saved to Rex designs by themselves; a reel isn't until it's used or saved, so ask first.
  // Stable, because the Modal moves focus into itself whenever onClose changes.
  const close = useCallback(() => {
    if (kind === "image") return onClose();
    void confirmDialog(t("rexModal.closeReel")).then((yes) => yes && onClose());
  }, [kind, onClose, t]);
  return (
    <Modal title={kind === "image" ? t("rexModal.image") : t("rexModal.reel")} onClose={close} wide="xl">
      {kind === "image" ? (
        <ImageGenClient
          storeName={data.storeName}
          brand={data.image.brand}
          ideas={data.image.ideas}
          initialSize={IMAGE_SIZE[format]}
          onUse={(image) => onUse({ kind: "image", ...image })}
        />
      ) : (
        <VideoStudio
          storeName={data.storeName}
          storeHost={data.reel.storeHost}
          initialProductId={null}
          purpose="social"
          brand={data.reel.brand}
          elevenLabs={data.reel.elevenLabs}
          costs={data.reel.costs}
          products={data.reel.products}
          onUse={(video) => onUse({ kind: "video", ...video })}
        />
      )}
    </Modal>
  );
}
