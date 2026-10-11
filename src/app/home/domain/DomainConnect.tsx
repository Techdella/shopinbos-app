"use client";

import { useRouter } from "next/navigation";
import { DomainSetup } from "@/components/builder/DomainSetup";

// Same behaviour as components/settings/DomainSettingsPanel, without its old-style wrapper.
export function DomainConnect({ storeSlug, storeName }: { storeSlug: string; storeName: string }) {
  const router = useRouter();
  return (
    <DomainSetup
      storeSlug={storeSlug}
      storeName={storeName}
      onDone={(domain) => {
        if (domain) router.refresh();
      }}
    />
  );
}
