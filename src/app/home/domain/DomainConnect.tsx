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
import { useT } from "@/components/i18n/I18nProvider";

type Registrar = { id: string; name: string; description: string; baseUrl: string; affiliateUrl: string | null };
type Choice = "buy" | "own" | "team";

// "Use your own domain" (simplicity rules, section 8A): three plain choices instead of DNS records.
// - Buy a new one (only when buying inside Shopinbos is switched on): search, pay, we set it up.
// - I already have one: we make a WhatsApp message with the steps for the person who set it up
//   (DomainOwnership; the records and the Verify button are folded under "technical details").
// - Ask the Shopinbos team to do it: a setup request (support ticket, topic "setup").
// Once a domain is waiting or connected, DomainOwnership shows its status instead.
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
  const t = useT("domain");
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
          doneLabel={t("done")}
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
          title={t("team.title")}
          description={t("team.desc")}
          feature="custom_domain"
          softwareQuestion={t("team.which")}
          softwarePlaceholder="yourbrand.com"
        />
      </div>
    );
  }

  const choices: Array<{ id: Choice; icon: IconName; title: string; desc: string }> = [
    ...(configured ? [{ id: "buy" as const, icon: "cart" as const, title: t("choice.buy"), desc: t("choice.buyDesc") }] : []),
    { id: "own", icon: "whatsapp", title: t("choice.own"), desc: t("choice.ownDesc") },
    { id: "team", icon: "chat", title: t("choice.team"), desc: t("choice.teamDesc") },
  ];

  return (
    <section className="grid min-w-0 gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6" aria-labelledby="own-address-title">
      <div>
        <h2 id="own-address-title" className="m-0 text-[22px] font-extrabold leading-tight">{t("choice.title")}</h2>
        <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">{t("choice.sub")}</p>
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
        <Fold summary={t("where.summary")}>
          <RegistrarList registrars={registrars} />
        </Fold>
      )}
    </section>
  );
}

function RegistrarList({ registrars }: { registrars: Registrar[] }) {
  const t = useT("domain");
  return (
    <div className="grid gap-3">
      <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{t("where.intro")}</p>
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
