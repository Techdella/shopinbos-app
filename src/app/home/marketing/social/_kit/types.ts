// Shapes the Social posts pages pass from the server to their client pieces.

export interface PickMedia {
  id: string;
  url: string;
  kind: "image" | "video";
  /** rex: a picture Rex made; reel: a Video studio reel; library: the media library; product: a product photo. */
  source: "rex" | "reel" | "library" | "product";
  label: string | null;
  width: number | null;
  height: number | null;
  poster: string | null;
  createdAt: string;
}

export interface ComposerProduct {
  id: string;
  name: string;
  price: string;
  image: string | null;
  url: string;
}

/** A post as the composer edits it. */
export interface ComposerPost {
  id: string | null;
  caption: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  mediaSource: PickMedia["source"] | "upload" | null;
  format: "square" | "portrait" | "story" | "landscape" | null;
  fit: "cover" | "fit";
  channels: Array<"instagram" | "facebook" | "whatsapp" | "tiktok" | "x">;
  productId: string | null;
  /** Lagos day and time it's planned for, if any. */
  day: string | null;
  time: string | null;
  status: string;
}

/** What Rex's picture and reel makers need inside the Social posts pop-up (rex-data.server.ts). */
export interface RexMakerData {
  storeName: string;
  image: { brand: import("@/app/studio/images/ImageGenClient").ImageBrand | null; ideas: string[] };
  reel: {
    storeHost: string;
    brand: import("@shared/video-style").ReelBrand;
    elevenLabs: boolean;
    costs: { image: number; video: number };
    products: import("@/app/home/video/VideoStudio").StudioProduct[];
  };
}

/** A design made in the pop-up, ready for the post. */
export type MadeDesign = { kind: "image"; url: string; width: number; height: number } | { kind: "video"; url: string; id: string | null };
