import type { Metadata } from "next";
import { StoreCanvas } from "./StoreCanvas";

// /store-canvas: the page the phone's store editor shows in its WebView (apps/mobile/src/components/store-editor).
// It draws the seller's real shop with the storefront's own renderer (TemplateStorefrontSurface, as the web builder
// does) from the draft the phone hands it in messages, and re-draws on every change without reloading. It loads
// nothing about any store by itself and has no data of its own: everything it shows comes from the app that opened
// it (shared/store-editor.ts CanvasInbound), so it needs no sign-in.

export const metadata: Metadata = { title: { absolute: "Shop editor" }, robots: "noindex, nofollow" };

export default function StoreCanvasPage() {
  return <StoreCanvas />;
}
