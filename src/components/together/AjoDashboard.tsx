"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { confirmDialog } from "@/components/ui/dialogs";
import { Box, Button, Message, StatusPill, act, call, inputClass, useFormat } from "./seller-ui";

// Ajo groups the seller runs (pilot "ajo"): the list, and one group: who has paid this week (green ticks), "Ship to
// <member> this week" once everyone has paid (makes their paid order), the collection order (drawn, editable before
// the start), removed members with the seller's recorded decision, and every contribution that landed.

type GroupRow = { id: string; productName: string; variantLabel: string | null; size: number; weekly: number; deposit: number; startDay: string; status: string; members: number; week: number; shipped: number; createdAt: string };

export function AjoList() {
  const t = useT("together");
  const { money, day } = useFormat();
  const [data, setData] = useState<{ walletReady: boolean; groups: GroupRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call<{ walletReady: boolean; groups: GroupRow[] }>("/api/app/together?view=ajo").then(setData).catch((err: Error) => setError(err.message || t("loadFailed")));
  }, [t]);
  if (error && !data) return <p className="text-app-danger">{error}</p>;
  if (!data) return <p className="text-app-ink-soft">…</p>;
  if (!data.groups.length) return <Box><p className="m-0 text-[14.5px] text-app-ink-soft">{t("ajoList.empty")}</p></Box>;
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {data.groups.map((group) => (
        <li key={group.id}>
          <Link href={`/home/ajo/${group.id}`} className="block rounded-[22px] border border-app-line bg-white p-5 text-app-ink no-underline hover:bg-app-canvas">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{group.productName}{group.variantLabel ? ` · ${group.variantLabel}` : ""}</div>
              <StatusPill status={group.status} />
            </div>
            <div className="mt-1 text-[13.5px] text-app-ink-soft">
              {t("ajoList.line", { members: group.members, size: group.size, weekly: money(group.weekly), date: day(group.startDay) })}
              {group.status === "running" ? ` · ${t("ajo.week", { week: group.week, size: group.size })}` : ""}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Member = { id: string; name: string; phone: string; position: number | null; status: string; isNew: boolean; autopay: boolean; collectedWeek: number | null; orderId: string | null; removedReason: string | null; settlement: string | null; paidWeeks: number };
type Detail = {
  id: string; productName: string; variantLabel: string | null; itemPrice: number; size: number; weekly: number; deposit: number; rules: string; startDay: string; status: string;
  drawSeed: string | null; drawnAt: string | null; orderSetBy: string | null; canReorder: boolean; week: number; shippedWeeks: number[];
  schedule: Array<{ week: number; day: string; paid: string[] }>; thisWeek: { paid: string[]; missing: string[]; complete: boolean } | null; shipTo: string | null; joinUrl: string | null;
  members: Member[]; settlements: Array<{ memberId: string; week: number; amount: number; deposit: number; fee: number; toYou: number; reference: string; via: string; extra: boolean; paidAt: string | null }>;
};

export function AjoGroupDetail({ groupId }: { groupId: string }) {
  const t = useT("together");
  const { money, day } = useFormat();
  const [group, setGroup] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    call<Detail>(`/api/app/together/ajo/${encodeURIComponent(groupId)}`)
      .then((loaded) => {
        setGroup(loaded);
        setOrder(loaded.members.filter((member) => member.status === "active").sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map((member) => member.id));
        setDecisions(Object.fromEntries(loaded.members.map((member) => [member.id, member.settlement ?? ""])));
      })
      .catch((err: Error) => setError(err.message || t("loadFailed")));
  }, [groupId, t]);
  useEffect(load, [load]);

  async function run(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !(await confirmDialog(confirmText))) return;
    setBusy(true);
    setNote(null);
    try {
      await act({ groupId, ...body });
      setNote({ tone: "success", text: t("saved") });
      load();
    } catch (err) {
      setNote({ tone: "error", text: (err as Error).message || t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (error && !group) return <p className="text-app-danger">{error}</p>;
  if (!group) return <p className="text-app-ink-soft">…</p>;
  const byId = new Map(group.members.map((member) => [member.id, member]));
  const shipTo = group.shipTo ? byId.get(group.shipTo) : null;
  const paidThisWeek = new Set(group.thisWeek?.paid ?? []);
  const share = group.joinUrl ? `https://wa.me/?text=${encodeURIComponent(`Join my ajo for ${group.productName}: ${money(group.weekly)} a week for ${group.size} weeks. ${group.joinUrl}`)}` : null;

  return (
    <div className="grid gap-5">
      <Box className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 min-w-0 flex-1 text-[18px] font-extrabold">{group.productName}{group.variantLabel ? ` · ${group.variantLabel}` : ""}</h2>
          <StatusPill status={group.status} />
        </div>
        <p className="m-0 text-[14px]">{t("ajoList.line", { members: group.members.filter((member) => member.status !== "removed").length, size: group.size, weekly: money(group.weekly), date: day(group.startDay) })}{group.deposit ? ` · ${t("ajo.deposit")}: ${money(group.deposit)}` : ""}</p>
        {group.status === "running" ? <p className="m-0 text-[14px] font-bold">{t("ajo.week", { week: group.week, size: group.size })}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {group.joinUrl ? <Button tone="line" onClick={() => { void navigator.clipboard?.writeText(group.joinUrl!); setNote({ tone: "success", text: t("ajo.copied") }); }}>{t("ajo.copyLink")}</Button> : null}
          {share && group.status === "forming" ? <a href={share} target="_blank" rel="noreferrer" className="inline-flex min-h-[42px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold no-underline">{t("ajo.share")}</a> : null}
          {group.status === "forming" ? <Button tone="line" disabled={busy} onClick={() => void run({ action: "ajo.start" })}>{t("ajo.startNow")}</Button> : null}
          {group.status === "forming" || group.status === "running" ? <Button tone="danger" disabled={busy} onClick={() => void run({ action: "ajo.cancel" }, t("ajo.confirmCancel"))}>{t("ajo.cancel")}</Button> : null}
        </div>
        <Message message={note} />
      </Box>

      {group.status === "running" && group.thisWeek ? (
        <Box className="grid gap-2">
          {shipTo ? (
            <>
              <p className="m-0 text-[16px] font-extrabold">{t("ajo.shipTo", { name: shipTo.name })}</p>
              <div><Button disabled={busy} onClick={() => void run({ action: "ajo.ship" })}>{t("ajo.ship")}</Button></div>
            </>
          ) : group.thisWeek.missing.length ? (
            <p className="m-0 text-[14.5px]">{t("ajo.waiting", { count: group.thisWeek.missing.length })}: {group.thisWeek.missing.map((id) => byId.get(id)?.name ?? "").join(", ")}</p>
          ) : null}
        </Box>
      ) : null}

      <Box className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 flex-1 text-[17px] font-extrabold">{t("ajo.order")}</h2>
          {group.drawnAt ? <span className="text-[12.5px] text-app-ink-soft">{group.orderSetBy === "seller" ? t("ajo.setBySeller") : t("ajo.drawn", { seed: (group.drawSeed ?? "").split(":")[1] ?? "" })}</span> : null}
        </div>
        <ol className="m-0 grid list-none gap-2 p-0">
          {(group.canReorder ? order.map((id) => byId.get(id)!).filter(Boolean) : group.members).map((member, index) => (
            <li key={member.id} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-app-line px-3 py-2">
              <span className="w-6 text-center font-extrabold">{member.position ?? "–"}</span>
              <span className="min-w-0 flex-1">
                <span className="font-bold">{member.name}</span>
                <span className="block text-[12.5px] text-app-ink-soft">{member.phone}{member.isNew ? ` · ${t("ajo.new")}` : ""} · {t("ajo.paidWeeks", { count: member.paidWeeks })}{member.autopay ? ` · ${t("plans.autopay")}` : ""}</span>
              </span>
              {group.status === "running" && (member.status === "active" || member.status === "collected") ? <span aria-hidden className={paidThisWeek.has(member.id) ? "text-[#1F7A4D]" : "text-app-ink-soft"}>{paidThisWeek.has(member.id) ? "✓" : "…"}</span> : null}
              <StatusPill status={member.status} />
              {member.orderId ? <Link href={`/home/orders/${member.orderId}`} className="text-[13px] font-bold text-app-accent-ink">{t("plans.order")}</Link> : null}
              {group.canReorder && index > 0 ? <button type="button" className="text-[13px] font-bold text-app-accent-ink" onClick={() => setOrder((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>{t("ajo.moveUp")}</button> : null}
              {member.status === "removed" || group.status === "cancelled" ? (
                <div className="grid w-full gap-1.5 pt-1">
                  {member.removedReason ? <span className="text-[12.5px] text-app-ink-soft">{member.removedReason}</span> : null}
                  <label className="grid gap-1">
                    <span className="text-[12.5px] font-bold">{t("ajo.decision")}</span>
                    <input value={decisions[member.id] ?? ""} onChange={(event) => setDecisions((current) => ({ ...current, [member.id]: event.target.value }))} maxLength={500} className={inputClass} />
                  </label>
                  <div><Button tone="line" disabled={busy} onClick={() => void run({ action: "ajo.settle", memberId: member.id, note: decisions[member.id] ?? "" })}>{t("ajo.saveDecision")}</Button></div>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {group.canReorder ? <div><Button disabled={busy} onClick={() => void run({ action: "ajo.reorder", order })}>{t("ajo.saveOrder")}</Button></div> : null}
      </Box>

      <Box className="grid gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">{t("ajo.rules")}</h2>
        <p className="m-0 whitespace-pre-line text-[14px] leading-[1.6]">{group.rules}</p>
      </Box>

      {group.settlements.length ? (
        <Box className="grid gap-2">
          <h2 className="m-0 text-[17px] font-extrabold">{t("ajo.contributions")}</h2>
          <p className="m-0 text-[13.5px] text-app-ink-soft">{t("plans.settlementsSub")}</p>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-[13.5px]">
            {group.settlements.map((row) => (
              <li key={row.reference} className="flex flex-wrap justify-between gap-2 border-b border-app-line pb-1.5 last:border-0">
                <span>{row.paidAt ? day(row.paidAt) : ""} · {byId.get(row.memberId)?.name ?? ""} · {t("ajo.week", { week: row.week, size: group.size })}{row.via === "autopay" ? ` · ${t("plans.autopay")}` : ""}{row.extra ? ` · ${t("plans.extra")}` : ""}</span>
                <span>{money(row.amount)} · {t("plans.fee")} {money(row.fee)} · <strong>{t("plans.toYou")} {money(row.toYou)}</strong></span>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </div>
  );
}
