"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DomainSetup } from "@/components/builder/DomainSetup";
import { Notice, Segmented } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

type Registrar = { id: string; name: string; description: string; baseUrl: string; affiliateUrl: string | null };

// "Connect one I own" / "Buy a new one" on the Domain page. Both run the shared DomainSetup flow (DNS records,
// verification, registrar checkout). Without the hosting keys on the server neither can work, so we say so
// instead of showing a form that fails; buying then links out to registrars.
export function DomainConnect({
  storeSlug,
  storeName,
  customDomain,
  configured,
  registrars,
}: {
  storeSlug: string;
  storeName: string;
  customDomain: string | null;
  configured: boolean;
  registrars: Registrar[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"connect" | "buy">("connect");
  const [checking, setChecking] = useState(0);

  const done = (domain: string | null) => {
    if (domain) router.refresh();
  };

  return (
    <div className="grid gap-4">
      {customDomain && (
        <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="link" size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] text-app-ink-soft">Your own domain</p>
            <a href={`https://${customDomain}`} target="_blank" rel="noopener noreferrer" className="break-all text-[16px] font-extrabold text-app-ink no-underline hover:underline">
              {customDomain}
            </a>
          </div>
          {configured && (
            <button
              type="button"
              onClick={() => {
                setTab("connect");
                setChecking((value) => value + 1);
              }}
              className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink hover:border-app-line-strong"
            >
              Check its records
            </button>
          )}
        </div>
      )}

      <Segmented
        className="w-full border border-app-line sm:w-fit"
        value={tab}
        onChange={setTab}
        options={[
          { value: "connect", label: "Connect one I own" },
          { value: "buy", label: "Buy a new one" },
        ]}
      />

      {!configured ? (
        tab === "connect" ? (
          <Notice tone="info">Connecting your own domain isn&apos;t switched on for this Shopinbos server yet. Your free address keeps working in the meantime.</Notice>
        ) : (
          <RegistrarList registrars={registrars} />
        )
      ) : (
        <DomainSetup
          key={`${tab}-${checking}`}
          option={tab}
          storeSlug={storeSlug}
          storeName={storeName}
          doneLabel="Done"
          initialDomain={tab === "connect" && checking > 0 ? customDomain : null}
          checkOnOpen={tab === "connect" && checking > 0}
          onDone={done}
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
