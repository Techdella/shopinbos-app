"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DomainSetup } from "@/components/builder/DomainSetup";
import { BackButton, cx } from "@/components/app-ui";
import { DomainOwnership } from "@/components/domains/DomainOwnership";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { Fold } from "@/components/simple/Fold";
import type { DomainSettingsState } from "@/lib/domains/verification";
import { Icon, type IconName } from "@/components/ui/Icon";

type Registrar = { id: string; name: string; description: string; baseUrl: string; affiliateUrl: string | null };
type Choice = "buy" | "own" | "team";

// "Use your own web address" (simplicity rules, section 8A): three plain choices instead of DNS records.
// - Buy a new one (only when buying inside Shopinbos is switched on): search, pay, we set it up.
// - I already have one: we make a WhatsApp message with the steps for the person who set it up
//   (DomainOwnership; the records and the Verify button are folded under "technical details").
// - Ask the Shopinbos team to do it: a setup request (support ticket, topic "setup").
// Once a web address is waiting or connected, DomainOwnership shows its status instead.
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
  const [choice, setChoice] = useState<Choice | null>(null);
  const hasOne = Boolean(initialState.live || initialState.pending);

  if (hasOne || choice === "own") {
    return (
      <div className="grid min-w-0 gap-3">
        {!hasOne && <BackButton onClick={() => setChoice(null)} />}
        <DomainOwnership initialState={initialState} onChange={() => router.refresh()} />
      </div>
    );
  }

  if (choice === "buy") {
    return (
      <div className="grid min-w-0 gap-3">
        <BackButton onClick={() => setChoice(null)} />
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
      </div>
    );
  }

  if (choice === "team") {
    return (
      <div className="grid min-w-0 gap-3">
        <BackButton onClick={() => setChoice(null)} />
        <SetupHelpRequest
          title="Use my own web address"
          description="Tell us the web address you have (or the name you'd like). We'll set it up with you and message you when your shop opens there."
          feature="custom_domain"
          softwareQuestion="Which web address?"
          softwarePlaceholder="yourbrand.com"
        />
      </div>
    );
  }

  const choices: Array<{ id: Choice; icon: IconName; title: string; desc: string }> = [
    ...(configured ? [{ id: "buy" as const, icon: "cart" as const, title: "Buy a new one", desc: "Search for a name and pay. We set it up for you." }] : []),
    { id: "own", icon: "whatsapp", title: "I already have one", desc: "Send the steps to the person who set it up. We make the WhatsApp message for you." },
    { id: "team", icon: "chat", title: "Ask the Shopinbos team to do it", desc: "We'll set it up with you, free." },
  ];

  return (
    <section className="grid min-w-0 gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6" aria-labelledby="own-address-title">
      <div>
        <h2 id="own-address-title" className="m-0 text-[22px] font-extrabold leading-tight">Use your own web address</h2>
        <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">Like yourbrand.com. Your free address keeps working too.</p>
      </div>
      <div className="grid gap-2.5">
        {choices.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setChoice(item.id)}
            className={cx("flex min-h-[76px] w-full items-center gap-3 rounded-[18px] border-2 border-app-line bg-white px-4 py-3 text-left transition hover:border-app-ink")}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={item.icon} size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold">{item.title}</span>
              <span className="mt-0.5 block text-[14px] leading-[1.45] text-app-ink-soft">{item.desc}</span>
            </span>
            <Icon name="chevRight" size={18} className="shrink-0 text-app-ink-soft" />
          </button>
        ))}
      </div>
      {!configured && registrars.length > 0 && (
        <Fold summary="Don't have one yet? Where to buy one">
          <RegistrarList registrars={registrars} />
        </Fold>
      )}
    </section>
  );
}

function RegistrarList({ registrars }: { registrars: Registrar[] }) {
  return (
    <div className="grid gap-3">
      <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">Buy one from a company below, then come back and choose &quot;I already have one&quot;.</p>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {registrars.map((registrar) => (
          <li key={registrar.id} className="min-w-0">
            <a
              href={registrar.affiliateUrl ?? registrar.baseUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex h-full flex-col gap-1.5 rounded-[18px] border border-app-line bg-white p-4 text-app-ink no-underline transition hover:border-app-line-strong"
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
