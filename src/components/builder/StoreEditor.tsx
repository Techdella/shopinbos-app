"use client";

// The advanced builder (/seller/store/builder and /builder/editor). The UI lives in ./editor.
import { Builder } from "./editor/Builder";
import type { RexTopic } from "./editor/RexPanel";

export function StoreEditor({
  initialRexOpen = false,
  initialRexTopic = null,
  initialFocus = null,
  you = null,
}: {
  initialRexOpen?: boolean;
  initialRexTopic?: RexTopic | null;
  initialFocus?: "header" | "footer" | null;
  you?: { name: string; avatarUrl: string | null } | null;
}) {
  return <Builder initialRexOpen={initialRexOpen} initialRexTopic={initialRexTopic} initialFocus={initialFocus} you={you} />;
}

export default StoreEditor;
