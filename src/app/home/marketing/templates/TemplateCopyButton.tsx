"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/growth/kit";
import { api, errorText } from "../_kit/client";

export function TemplateCopyButton({ templateKey }: { templateKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClass("white", "sm")}
      onClick={async () => {
        setBusy(true);
        try {
          const copy = await api<{ id: string }>("/api/app/marketing/templates", "POST", { copy: templateKey });
          router.push(`/home/marketing/templates/${copy.id}`);
        } catch (error) {
          window.alert(errorText(error));
          setBusy(false);
        }
      }}
    >
      {busy ? "Copying…" : "Copy and edit"}
    </button>
  );
}
