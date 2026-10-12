"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DomainSetup } from "@/components/builder/DomainSetup";
import { Segmented } from "@/components/app-ui";
import { DomainOwnership } from "@/components/domains/DomainOwnership";
import type { DomainSettingsState } from "@/lib/domains/verification";
import { Icon } from "@/components/ui/Icon";

type Registrar = { id: string; name: string; description: string; baseUrl: string; affiliateUrl: string | null };

// "Connect one I own" / "Buy a new one" on the Domain page. Connecting runs the ownership check (DNS records,
// then Verify); it works without the hosting keys (support then adds the domain to hosting). Buying needs the
// hosting keys; without them it links out to registrars.
export function DomainConnect({
  storeSlug,
  storeName,
  configured,
  initialState,
  registrars,
}: {
  storeSlug: string;
  storeName: string;
  configured: boolean;
  initialState: DomainSettingsState;
  registrars: Registrar[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"connect" | "buy">("connect");

  return (
    <div className="grid min-w-0 gap-4">
      <Segmented
        className="w-full border border-app-line sm:w-fit"
        value={tab}
        onChange={setTab}
        options={[
          { value: "connect", label: "Connect one I own" },
          { value: "buy", label: "Buy a new one" },
        ]}
      />

      {tab === "connect" ? (
        <DomainOwnership initialState={initialState} onChange={() => router.refresh()} />
      ) : !configured ? (
        <RegistrarList registrars={registrars} />
      ) : (
        <DomainSetup
          key="buy"
          option="buy"
          storeSlug={storeSlug}
          storeName={storeName}
          doneLabel="Done"
          onDone={(domain) => {
            if (domain) router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RegistrarList({ registrars }: { registrars: Registrar[] }) {
  return (
    <div className="grid gap-3">
      <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">Buying inside Shopinbos isn&apos;t switched on yet. Buy one from a registrar below, then come back and connect it.</p>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {registrars.map((registrar) => (
          <li key={registrar.id} className="min-w-0">
            <a
              href={registrar.affiliateUrl ?? registrar.baseUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex h-full flex-col gap-1.5 rounded-[22px] border border-app-line bg-white p-4 text-app-ink no-underline transition hover:border-app-line-strong"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-extrabold">{registrar.name}</span>
                <Icon name="link" size={14} className="shrink-0 text-app-ink-soft" />
              </span>
              <span className="text-[13.5px] leading-[1.5] text-app-ink-soft">{registrar.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
