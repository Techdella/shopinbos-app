"use client";

import { useState, useTransition } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { CAC_COMPANY_TYPES, CAC_COMPANY_TYPE_LABELS } from "@/lib/kyb/cac";
import { WalletAccountCard } from "./WalletAccountCard";

// The wallet's own account number on the wallet card: the number in the verified business name (CAC) or the owner's
// NIN-verified name, what it's for (the ⓘ explainer), and the forms to verify one of those names. A business with a
// number in a person's name is asked for its CAC details so it gets a number in the business's name; one that isn't
// registered yet is offered CAC registration when that's open to it.

export type WalletAccountView = {
  topUpAccount: { number: string; name: string; bank: string } | null;
  topUpAccountStatus?: "ready" | "setting_up" | "needs_phone" | "needs_identity" | "off";
  accountNameKind?: "business" | "person" | null;
  /** Transfers to the number settle straight to this bank. Older servers don't send it. */
  topUpGoesTo?: string | null;
  businessVerified?: boolean;
  checks?: { business: boolean; nin: boolean };
  registration?: { href: string } | null;
};

const fieldClass = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[15px] outline-none focus:border-app-ink";
const box = "mt-4 rounded-[18px] border border-app-line bg-app-canvas p-4";

export function WalletAccountPanel<V extends WalletAccountView>({ view, onUpdated }: { view: V; onUpdated: (view: V) => void }) {
  const [explain, setExplain] = useState(false);
  const [form, setForm] = useState<"business" | "nin" | null>(null);
  const account = view.topUpAccount;
  const status = view.topUpAccountStatus;
  if (!account && status !== "needs_identity" && status !== "needs_phone" && status !== "setting_up") return null;

  const infoButton = (light: boolean) => (
    <button
      type="button"
      aria-expanded={explain}
      aria-controls="wallet-account-explainer"
      onClick={() => setExplain(!explain)}
      className={cx("inline-flex size-7 items-center justify-center rounded-full", light ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-app-ink-soft hover:bg-white")}
      title="What is this account?"
    >
      <Icon name="info" size={16} />
      <span className="sr-only">What is this account?</span>
    </button>
  );
  const explainNote = explain ? (
    <div id="wallet-account-explainer" role="note" className="rounded-[14px] border border-app-line bg-white p-3 text-[13px] leading-[1.5] text-app-ink-soft">
      This is a real bank account number, in your business&apos;s name (or yours until your business is verified).
      {view.topUpGoesTo ? (
        <ul className="m-0 mt-1.5 list-disc pl-5">
          <li><strong>Get paid:</strong> share it with customers or anyone who owes you. What they send goes straight to your bank, {view.topUpGoesTo}, usually the next working day. Shopinbos never holds it.</li>
          <li><strong>See every payment:</strong> each transfer shows on your statement with who sent it, and we tell you the moment it arrives.</li>
          <li><strong>Top up to spend:</strong> pay by card with Top up to add to your balance for AI credits and other Shopinbos services.</li>
          <li><strong>Withdraw:</strong> anything left on your balance can go to your bank whenever you like.</li>
        </ul>
      ) : (
        <ul className="m-0 mt-1.5 list-disc pl-5">
          <li><strong>Top up:</strong> transfer to it from any bank app, or pay by card with Top up.</li>
          <li><strong>Spend:</strong> your balance pays for AI credits and other Shopinbos services.</li>
          <li><strong>Withdraw:</strong> send what&apos;s left to your main bank account whenever you like.</li>
          <li><strong>Get paid straight to your bank:</strong> add your bank below and transfers to this account go straight to it.</li>
        </ul>
      )}
    </div>
  ) : null;

  return (
    <div className={account ? "mt-4 grid gap-3" : box}>
      {account ? (
        <>
          <WalletAccountCard account={account} aside={infoButton(true)} goesTo={view.topUpGoesTo} />
          {explainNote}
          {view.accountNameKind !== "business" && !view.businessVerified ? (
            <div className="rounded-[14px] border border-app-line bg-app-canvas p-3 text-[13px] leading-[1.5]">
              <strong>Show your business name on this account.</strong> Add your business&apos;s CAC details and we&apos;ll give you a number in your business&apos;s name. Your current number keeps working.
              <div className="mt-2 flex flex-wrap gap-2">
                {view.checks?.business ? <SmallButton onClick={() => setForm(form === "business" ? null : "business")}>Add my business name</SmallButton> : null}
                {view.registration ? <a href={view.registration.href} className="inline-flex min-h-[34px] items-center rounded-full border border-app-line px-3 text-[13px] font-bold">Not registered? Register with CAC</a> : null}
              </div>
            </div>
          ) : null}
          {view.businessVerified && view.accountNameKind !== "business" ? (
            <p className="m-0 text-[12.5px] text-app-ink-soft">Your business is verified: your account number in its name is on its way.</p>
          ) : null}
        </>
      ) : status === "needs_identity" ? (
        <>
          <div className="flex items-center gap-1 text-[14px] font-extrabold">Get your own wallet account number {infoButton(false)}</div>
          {explainNote ? <div className="mt-2">{explainNote}</div> : null}
          <p className="mb-0 mt-1 text-[13px] leading-[1.5] text-app-ink-soft">
            The account is opened in a verified name: your business&apos;s, from its CAC registration, or yours, from your NIN. Until then you can top up by card.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.checks?.business ? <SmallButton active={form === "business"} onClick={() => setForm("business")}>Use my registered business</SmallButton> : null}
            {view.checks?.nin ? <SmallButton active={form === "nin"} onClick={() => setForm("nin")}>Use my NIN</SmallButton> : null}
          </div>
          {view.registration ? (
            <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">
              No CAC registration yet? Use your NIN now, and <a href={view.registration.href} className="font-bold underline underline-offset-4">register your business name with CAC</a> to get a number in your business&apos;s name later.
            </p>
          ) : null}
        </>
      ) : status === "needs_phone" ? (
        <p className="m-0 text-[13.5px] text-app-ink-soft">Add your phone number to your account to get your own wallet account number. The bank needs it to open the account.</p>
      ) : (
        <p className="m-0 text-[13.5px] text-app-ink-soft">Your wallet account number is being created. It shows here in a few minutes; until then you can top up by card.</p>
      )}

      {form === "business" ? <BusinessForm onDone={onUpdated} /> : null}
      {form === "nin" ? <NinForm onDone={onUpdated} /> : null}
    </div>
  );
}

function SmallButton({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx("inline-flex min-h-[34px] items-center rounded-full border px-3 text-[13px] font-bold", active ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
      {children}
    </button>
  );
}

function useSubmit<V>(url: string, onDone: (view: V) => void) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const submit = (body: Record<string, string>) =>
    start(async () => {
      setMessage(null);
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { message?: string; wallet?: V }; error?: { message?: string } } | null;
      if (!response?.ok) return setMessage({ tone: "error", text: json?.error?.message ?? "That didn't work. Try again." });
      setMessage({ tone: "ok", text: json?.data?.message ?? "Done." });
      if (json?.data?.wallet) onDone(json.data.wallet);
    });
  const note = message ? <p role="status" className={cx("m-0 rounded-[12px] px-3 py-2 text-[13px] font-semibold", message.tone === "ok" ? "bg-app-success-tint text-app-success" : "bg-app-danger-tint text-app-danger")}>{message.text}</p> : null;
  return { pending, submit, note };
}

function BusinessForm<V>({ onDone }: { onDone: (view: V) => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [type, setType] = useState("BUSINESS_NAME");
  const { pending, submit, note } = useSubmit<V>("/api/app/wallet/business", onDone);
  return (
    <form className="mt-3 grid gap-2.5" onSubmit={(event) => { event.preventDefault(); submit({ businessName: name, number, companyType: type }); }}>
      <label className="grid gap-1 text-[13px] font-bold">
        Business name, exactly as on your CAC certificate
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="organization" />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] font-bold">
          BN or RC number
          <input className={fieldClass} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="BN 1234567" required />
        </label>
        <label className="grid gap-1 text-[13px] font-bold">
          Business type
          <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value)}>
            {CAC_COMPANY_TYPES.map((key) => <option key={key} value={key}>{CAC_COMPANY_TYPE_LABELS[key]}</option>)}
          </select>
        </label>
      </div>
      <p className="m-0 text-[12px] text-app-ink-soft">We check it with CAC. Your name has to be on the business&apos;s CAC record (verify your NIN first if your account name is different).</p>
      <button type="submit" disabled={pending} className="inline-flex min-h-[42px] w-fit items-center rounded-full bg-app-accent px-5 text-[14px] font-bold text-white disabled:opacity-60">{pending ? "Checking with CAC…" : "Check my business"}</button>
      {note}
    </form>
  );
}

function NinForm<V>({ onDone }: { onDone: (view: V) => void }) {
  const [nin, setNin] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const { pending, submit, note } = useSubmit<V>("/api/app/wallet/identity", onDone);
  return (
    <form className="mt-3 grid gap-2.5" onSubmit={(event) => { event.preventDefault(); submit({ nin, firstName, lastName, dateOfBirth }); }}>
      <label className="grid gap-1 text-[13px] font-bold">
        NIN (11 digits)
        <input className={fieldClass} value={nin} onChange={(e) => setNin(e.target.value)} inputMode="numeric" maxLength={14} required />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="grid gap-1 text-[13px] font-bold">
          First name
          <input className={fieldClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
        </label>
        <label className="grid gap-1 text-[13px] font-bold">
          Last name
          <input className={fieldClass} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
        </label>
        <label className="grid gap-1 text-[13px] font-bold">
          Date of birth
          <input type="date" className={fieldClass} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} autoComplete="bday" required />
        </label>
      </div>
      <p className="m-0 text-[12px] text-app-ink-soft">Type them exactly as on your NIN slip. We keep only the last 4 digits of your NIN; the account is opened in the name on it.</p>
      <button type="submit" disabled={pending} className="inline-flex min-h-[42px] w-fit items-center rounded-full bg-app-accent px-5 text-[14px] font-bold text-white disabled:opacity-60">{pending ? "Checking…" : "Verify my NIN"}</button>
      {note}
    </form>
  );
}
