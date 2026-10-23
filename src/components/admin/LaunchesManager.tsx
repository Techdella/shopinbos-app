"use client";

import { useEffect, useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { confirmDialog } from "@/components/ui/dialogs";
import { friendlyError } from "@/lib/errors/report-client";

// Admin › Launches (/api/admin/launches). Registering a business name with CAC through Shopinbos is hidden from
// sellers, suppliers and delivery partners until it's switched on here. The first switch-on emails everyone
// ("You can now register your business with CAC on Shopinbos") through product news.

type History = { id: string; after: { live?: boolean } | null; note: string | null; createdAt: string; changedBy: { name: string | null; email: string | null } | null };
type View = {
  businessRegistration: { live: boolean; changedAt: string | null; announcementId: string | null; ready: { cacVas: boolean; paystack: boolean }; history: History[] };
};

const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

export function LaunchesManager() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/launches")
      .then((r) => r.json())
      .then((json) => (json?.data ? setView(json.data) : setMessage({ tone: "error", text: json?.error?.message ?? "Couldn't load launches." })))
      .catch(() => setMessage({ tone: "error", text: "Couldn't load launches." }));
  }, []);

  async function toggle(live: boolean) {
    const reg = view?.businessRegistration;
    if (live && !reg?.announcementId && announce && !(await confirmDialog({ title: "Switch on CAC registration?", message: "Every seller, supplier and delivery partner gets an email saying they can now register their business with CAC on Shopinbos.", confirmLabel: "Switch on and email" }))) return;
    if (!live && !(await confirmDialog({ title: "Switch CAC registration off?", message: "The pages and links are hidden again. Applications already started keep being tracked.", tone: "warning", confirmLabel: "Switch off" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/launches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature: "business_registration", live, announce }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't save that.");
      setView(json.data.view);
      setMessage({
        tone: "success",
        text: live ? (json.data.announced ? "CAC registration is live. The announcement email is sending (follow it in Product news)." : "CAC registration is live.") : "CAC registration is switched off.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? friendlyError(error) : "Couldn't save that." });
    } finally {
      setBusy(false);
    }
  }

  const reg = view?.businessRegistration;
  const ready = Boolean(reg?.ready.cacVas && reg?.ready.paystack);

  return (
    <Card className="mb-6 p-5">
      <CardHead
        title="Register a business with CAC"
        sub="Sellers, suppliers and delivery partners register their business name with CAC from Shopinbos, paid on Paystack."
        action={reg ? (reg.live ? <Pill tone="success" dot>Live</Pill> : <Pill tone="muted" dot>Hidden</Pill>) : null}
      />
      {!reg ? (
        <p className="m-0 mt-4 text-[14px] text-app-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { name: "CAC VAS API key", env: "CAC_VAS_API_KEY", on: reg.ready.cacVas },
              { name: "Paystack", env: "PAYSTACK_SECRET_KEY", on: reg.ready.paystack },
            ].map((key) => (
              <div key={key.env} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-app-line px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-extrabold">{key.name}</div>
                  <code className="font-mono text-[12px] text-app-ink-soft">{key.env}</code>
                </div>
                {key.on ? <Pill tone="success" dot>Key added</Pill> : <Pill tone="warning" dot>Not set</Pill>}
              </div>
            ))}
          </div>
          <p className="m-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">
            While it's hidden, the register-business pages, links and APIs are off, and Peggy says it's coming soon. Businesses that are already registered can still verify with their CAC number.
            {reg.announcementId ? " The announcement email has already gone out, so switching on again won't send another." : " The first time you switch it on, everyone gets an email saying they can now register their business with CAC on Shopinbos."}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {reg.live ? (
              <PillButton size="sm" tone="white" busy={busy} onClick={() => toggle(false)}>Switch off</PillButton>
            ) : (
              <PillButton size="sm" busy={busy} disabled={!ready} onClick={() => toggle(true)}>{reg.announcementId || !announce ? "Switch on" : "Switch on and email everyone"}</PillButton>
            )}
            {!reg.live && !reg.announcementId ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
                <input type="checkbox" checked={announce} onChange={(event) => setAnnounce(event.target.checked)} />
                Send the announcement email
              </label>
            ) : null}
            {reg.announcementId ? <a href="/admin/product-news" className="text-[13px] font-bold underline underline-offset-4">See the announcement</a> : null}
          </div>
          {!ready && !reg.live ? <p className="m-0 mt-2 text-[13px] text-app-ink-soft">Add both keys in Vercel → Settings → Environment Variables and redeploy before switching it on.</p> : null}

          {reg.history.length ? (
            <ul className="m-0 mt-5 grid list-none gap-1.5 p-0 text-[13px] text-app-ink-soft">
              {reg.history.map((row) => (
                <li key={row.id}>
                  {when(row.createdAt)} · {row.after?.live ? "Switched on" : "Switched off"} by {row.changedBy?.name || row.changedBy?.email || "the team"}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {message ? <div className="mt-3"><Notice tone={message.tone}>{message.text}</Notice></div> : null}
    </Card>
  );
}
