"use client";

// The advanced builder (/seller/store/builder and /builder/editor). The UI lives in ./editor.
import { Builder } from "./editor/Builder";

export function StoreEditor({ initialRexOpen = false }: { initialRexOpen?: boolean }) {
  return <Builder initialRexOpen={initialRexOpen} />;
}

export default StoreEditor;
