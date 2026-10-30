"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { ItemThumb, Panel, PrimaryButton, ProgressBar, SecondaryButton } from "@/components/storefront/shopper/ShopperShell";
import { groupShareText, savingKobo, timeLeft } from "@shared/group-buy";
import { DetailsFields, Notice, ReturnNotice, Shell, detailsBody, goToPaystack, nairaText, postTogether, useDetails, useTheme, type TogetherStore } from "./together-ui";
import type { publicGroup } from "@/lib/pay-together/group-buy.server";

// A group buy's page (/group/<id>): "₦X each when N join (ends in hh:mm)", who's in (first names), share on WhatsApp,
// and Join. A member's own link (?m=…&t=…) shows their status and, if their card couldn't be charged, a pay link.

type Group = NonNullable<Awaited<ReturnType<typeof publicGroup>>>;

const ME_TEXT: Record<string, string> = {
  pending: "We're still checking your card. Refresh in a minute.",
  joined: "You're in! Your card is charged only if the group fills.",
  charged: "Paid. The shop is preparing your order.",
  pay_link: "The group filled, but we couldn't charge your card. Pay within 2 hours to keep your place.",
  dropped: "The time to pay ran out, so you're out of this group.",
  cancelled: "The group didn't fill. Nobody was charged.",
};

export function GroupClient({ store, storeBasePath, group, returned }: { store: TogetherStore; storeBasePath: string; group: Group; returned: string | null }) {
  const theme = useTheme(store);
  const [details, setDetails] = useDetails(store.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(group.timeLeft);
  useEffect(() => {
    const timer = window.setInterval(() => setLeft(timeLeft(group.endsAt, Date.now()).label), 30_000);
    return () => window.clearInterval(timer);
  }, [group.endsAt]);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${getPublicStorefrontPath(storeBasePath, `/group/${group.id}`)}`;
  const share = `https://wa.me/?text=${encodeURIComponent(groupShareText({ productName: group.productName, storeName: store.name, priceText: nairaText(group.priceKobo), size: group.size, joined: group.joined, url, timeLeftLabel: left }))}`;

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const answer = await postTogether(store.slug, body);
    if (answer.ok) goToPaystack(answer.data.authorizationUrl);
    else {
      setError(answer.message);
      setBusy(false);
    }
  }

  const percent = Math.min(100, Math.floor((group.joined / group.size) * 100));

  return (
    <Shell store={store} theme={theme} basePath={storeBasePath} title="Buy with friends">
      <div className="grid gap-5">
        <ReturnNotice theme={theme} returned={returned} paidText={group.me?.status === "charged" ? "Paid. Thank you!" : "Your card is saved. Your ₦50 comes off the group price."} />
        <div className="flex items-center gap-4">
          <ItemThumb theme={theme} src={group.productImage} alt={group.productName} size={72} />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold uppercase tracking-wide" style={{ color: theme.muted }}>Buy with friends · {store.name}</p>
            <h1 className="m-0 text-[24px] font-semibold leading-tight" style={{ fontFamily: theme.heading }}>{group.productName}{group.variantLabel ? ` · ${group.variantLabel}` : ""}</h1>
          </div>
        </div>

        <Panel theme={theme} className="grid gap-3 p-5">
          <p className="m-0 text-[17px]">
            <strong>{nairaText(group.priceKobo)} each when {group.size} join</strong>
            {group.state === "open" ? ` (ends in ${left})` : ""}
          </p>
          <p className="m-0 text-[14px]" style={{ color: theme.muted }}>Normally {nairaText(group.retailKobo)}: save {nairaText(savingKobo(group.retailKobo, group.priceKobo))}. Nobody pays unless the group fills.</p>
          <ProgressBar theme={theme} percent={percent} label="People joined" />
          <p className="m-0 text-[14px]">{group.joined} of {group.size} joined{group.members.length ? `: ${group.members.join(", ")}` : ""}</p>
          {group.state === "open" ? (
            <a href={share} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-[14px] font-semibold no-underline" style={{ borderColor: theme.border, color: theme.ink }}>Share on WhatsApp</a>
          ) : null}
          {group.state === "expired" || group.status === "cancelled" ? <Notice theme={theme} tone="info">This group closed before it filled. Nobody was charged.</Notice> : null}
          {group.status === "filled" || group.status === "charged" ? <Notice theme={theme} tone="success">This group is full.</Notice> : null}
        </Panel>

        {group.me ? (
          <Panel theme={theme} className="grid gap-3 p-5">
            <h2 className="m-0 text-[18px] font-semibold">Your place</h2>
            <p className="m-0 text-[15px]">{ME_TEXT[group.me.status] ?? group.me.status}</p>
            {group.me.status === "charged" && group.me.orderId ? <Link href={getPublicStorefrontPath(storeBasePath, `/order/${group.me.orderId}`)} style={{ color: theme.ink }}>Track your order</Link> : null}
            {group.me.status === "pay_link" ? (
              <>
                {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
                <PrimaryButton theme={theme} type="button" disabled={busy} onClick={() => void run({ action: "group.pay", groupId: group.id, memberId: group.me!.id, token: group.me!.token })}>{busy ? "Opening Paystack…" : `Pay ${nairaText(group.priceKobo)}`}</PrimaryButton>
              </>
            ) : null}
          </Panel>
        ) : null}

        {!group.me && group.state === "open" ? (
          <Panel theme={theme} className="grid gap-4 p-5">
            <h2 className="m-0 text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>Join this group</h2>
            <DetailsFields theme={theme} details={details} onChange={setDetails} />
            <p className="m-0 text-[13px]" style={{ color: theme.muted }}>To save your card you pay ₦50 to the shop now. When the group fills, your card is charged the rest of {nairaText(group.priceKobo)} and the shop sends your order. If it doesn't fill in time, the shop sends your ₦50 back.</p>
            {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
            <PrimaryButton theme={theme} type="button" disabled={busy} onClick={() => void run({ action: "group.join", productId: group.productId, groupId: group.id, ...detailsBody(details) })}>{busy ? "Opening Paystack…" : "Join the group"}</PrimaryButton>
          </Panel>
        ) : null}
        {!group.me && group.state !== "open" ? (
          <SecondaryButton theme={theme} type="button" onClick={() => window.location.assign(getPublicStorefrontPath(storeBasePath, `/buy/${group.productId}`))}>Start a new group</SecondaryButton>
        ) : null}
      </div>
    </Shell>
  );
}
