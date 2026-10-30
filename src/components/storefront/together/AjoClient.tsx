"use client";

import { useState } from "react";
import { ItemThumb, Panel, PrimaryButton, SecondaryButton, fieldClass } from "@/components/storefront/shopper/ShopperShell";
import { Check, DetailsFields, Notice, ReturnNotice, Shell, dayLabel, detailsBody, goToPaystack, nairaText, postTogether, useDetails, useTheme, type TogetherStore } from "./together-ui";
import type { publicAjoGroup } from "@/lib/pay-together/ajo.server";

// An ajo group's public page (/ajo/<id>): the rules, the schedule, who has joined (first names only, a green tick when
// they've paid this week), and Join: verify your phone with a code, accept the rules, pay week 1 (and any joining
// deposit) through Paystack, straight to the shop's bank. A member's own link (?m=…&t=…) shows "Pay this week".

type Group = NonNullable<Awaited<ReturnType<typeof publicAjoGroup>>>;

export function AjoClient({ store, storeBasePath, group, returned }: { store: TogetherStore; storeBasePath: string; group: Group; returned: string | null }) {
  const theme = useTheme(store);
  const [details, setDetails] = useDetails(store.slug);
  const [accept, setAccept] = useState(false);
  const [autopay, setAutopay] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [codeNeeded, setCodeNeeded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const full = group.joined >= group.size;
  const open = group.status === "forming" && !full;

  async function sendCode() {
    setBusy(true);
    setError(null);
    const answer = await postTogether<{ required: boolean; challenge?: string }>(store.slug, { action: "ajo.code", groupId: group.id, phone: details.phone });
    setBusy(false);
    if (!answer.ok) return setError(answer.message);
    if (!answer.data.required) {
      setCodeNeeded(false);
      setInfo("No code needed right now. Carry on.");
      return;
    }
    setChallenge(answer.data.challenge ?? null);
    setInfo("We sent you a 6-digit code.");
  }

  async function checkCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/store/${encodeURIComponent(store.slug)}/checkout/phone-verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: details.phone, code, challenge }) });
      const json = (await response.json().catch(() => null)) as { data?: { phoneToken?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.phoneToken) setError(json?.error?.message ?? "That code isn't right.");
      else {
        setPhoneToken(json.data.phoneToken);
        setInfo("Phone number verified.");
      }
    } catch {
      setError("No connection. Try again.");
    }
    setBusy(false);
  }

  async function join() {
    setBusy(true);
    setError(null);
    const answer = await postTogether(store.slug, { action: "ajo.join", groupId: group.id, acceptRules: accept, autopay, ...(phoneToken ? { phoneToken } : {}), ...detailsBody(details) });
    if (answer.ok) goToPaystack(answer.data.authorizationUrl);
    else {
      setError(answer.message);
      setBusy(false);
    }
  }

  async function payWeek() {
    if (!group.me) return;
    setBusy(true);
    setError(null);
    const answer = await postTogether(store.slug, { action: "ajo.pay", groupId: group.id, memberId: group.me.id, token: group.me.token });
    if (answer.ok) goToPaystack(answer.data.authorizationUrl);
    else {
      setError(answer.message);
      setBusy(false);
    }
  }

  const verified = Boolean(phoneToken) || !codeNeeded;

  return (
    <Shell store={store} theme={theme} basePath={storeBasePath} title="Ajo group">
      <div className="grid gap-5">
        <ReturnNotice theme={theme} returned={returned} paidText="Payment received. Thank you!" />
        <div className="flex items-center gap-4">
          <ItemThumb theme={theme} src={group.productImage} alt={group.productName} size={72} />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold uppercase tracking-wide" style={{ color: theme.muted }}>Ajo · {store.name}</p>
            <h1 className="m-0 text-[24px] font-semibold leading-tight" style={{ fontFamily: theme.heading }}>{group.productName}{group.variantLabel ? ` · ${group.variantLabel}` : ""}</h1>
            <p className="m-0 mt-1 text-[15px]"><strong>{nairaText(group.weeklyKobo)} a week</strong> for {group.size} weeks · item worth {nairaText(group.itemPriceKobo)}</p>
          </div>
        </div>

        {group.me ? (
          <Panel theme={theme} className="grid gap-3 p-5">
            <h2 className="m-0 text-[18px] font-semibold">Your place</h2>
            <p className="m-0 text-[15px]">
              {group.me.status === "removed" ? "You were removed from this group. The shop will contact you." : group.me.status === "collected" ? "You've collected your item. Keep paying each week until the group ends." : group.me.position ? `You collect in week ${group.me.position}.` : "The collection order is drawn when the group is full."}
            </p>
            <p className="m-0 text-[14px]" style={{ color: theme.muted }}>Weeks paid: {group.me.paidWeeks.length ? group.me.paidWeeks.join(", ") : "none yet"}{group.me.autopay ? " · your card is charged automatically" : ""}</p>
            {group.me.owedWeek ? (
              <>
                {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
                <PrimaryButton theme={theme} type="button" disabled={busy} onClick={() => void payWeek()}>{busy ? "Opening Paystack…" : `Pay week ${group.me.owedWeek} (${nairaText(group.weeklyKobo)})`}</PrimaryButton>
              </>
            ) : null}
          </Panel>
        ) : null}

        <Panel theme={theme} className="p-5">
          <h2 className="m-0 mb-2 text-[17px] font-semibold">Members ({group.joined} of {group.size})</h2>
          {group.members.length ? (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {group.members.map((member, index) => (
                <li key={index} className="flex items-center justify-between text-[14.5px]">
                  <span>{member.position ? `${member.position}. ` : ""}{member.firstName}{member.collected ? " · collected" : ""}</span>
                  {group.week ? <span aria-label={member.paidThisWeek ? "Paid this week" : "Not paid yet this week"} style={{ color: member.paidThisWeek ? "#1F7A4D" : theme.muted }}>{member.paidThisWeek ? "✓ paid" : "…"}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[14px]" style={{ color: theme.muted }}>Be the first to join.</p>
          )}
        </Panel>

        <Panel theme={theme} className="p-5">
          <h2 className="m-0 mb-2 text-[17px] font-semibold">Schedule</h2>
          <p className="m-0 mb-2 text-[14px]" style={{ color: theme.muted }}>Starts {dayLabel(group.startDay)}{group.week ? ` · now in week ${group.week}` : ""}. Each week, once everyone has paid, that week's member gets their item.</p>
          <ol className="m-0 grid list-none grid-cols-2 gap-1 p-0 text-[14px] sm:grid-cols-3">
            {group.schedule.map((entry) => <li key={entry.week}>Week {entry.week}: {dayLabel(entry.day)}</li>)}
          </ol>
        </Panel>

        <Panel theme={theme} className="p-5">
          <h2 className="m-0 mb-2 text-[17px] font-semibold">Rules</h2>
          <p className="m-0 whitespace-pre-line text-[14px] leading-[1.6]">{group.rules}</p>
          {group.depositKobo ? <p className="m-0 mt-2 text-[14px]"><strong>Joining deposit:</strong> {nairaText(group.depositKobo)}, paid with week 1.</p> : null}
          <p className="m-0 mt-2 text-[13px]" style={{ color: theme.muted }}>{group.verificationNote} Every payment goes straight to {store.name} through Paystack.</p>
        </Panel>

        {!group.me && open ? (
          <Panel theme={theme} className="grid gap-4 p-5">
            <h2 className="m-0 text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>Join this group</h2>
            <DetailsFields theme={theme} details={details} onChange={setDetails} addressNote="Where should your item be delivered on your turn?" />
            {!verified ? (
              <div className="grid gap-2">
                {!challenge ? (
                  <SecondaryButton theme={theme} type="button" disabled={busy || details.phone.trim().length < 7} onClick={() => void sendCode()}>Send me a code</SecondaryButton>
                ) : (
                  <div className="flex items-end gap-2">
                    <label className="block flex-1 text-[14px] font-semibold">
                      6-digit code
                      <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={fieldClass} style={{ borderColor: theme.border }} />
                    </label>
                    <SecondaryButton theme={theme} type="button" disabled={busy || code.trim().length < 6} onClick={() => void checkCode()}>Check</SecondaryButton>
                  </div>
                )}
              </div>
            ) : null}
            {info ? <Notice theme={theme} tone="info">{info}</Notice> : null}
            <Check theme={theme} checked={accept} onChange={setAccept}>I've read the rules above and agree to them.</Check>
            <Check theme={theme} checked={autopay} onChange={setAutopay}>Pay automatically each week (Paystack keeps your card safely and charges it on each due day).</Check>
            {error ? <Notice theme={theme} tone="error">{error}</Notice> : null}
            <PrimaryButton theme={theme} type="button" disabled={busy || !verified || !accept} onClick={() => void join()}>
              {busy ? "Opening Paystack…" : `Join and pay ${nairaText(group.weeklyKobo + group.depositKobo)}`}
            </PrimaryButton>
          </Panel>
        ) : null}
        {!group.me && !open ? <Notice theme={theme} tone="info">{group.status === "forming" ? "This group is full." : "This group has started. Ask the shop about the next one."}</Notice> : null}
      </div>
    </Shell>
  );
}
