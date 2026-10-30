"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { confirmDialog } from "@/components/ui/dialogs";
import { Box, Button, Message, StatusPill, act, call, useFormat } from "./seller-ui";

// Group buys for the seller's products (pilot "group_buy"): how full each group is, its members and their orders.
// Members are charged only when a group fills, each payment split straight to the seller's bank.

type Group = { id: string; productName: string; variantLabel: string | null; price: number; retail: number; size: number; joined: number; status: string; endsAt: string; createdAt: string; members: Array<{ id: string; name: string; phone: string | null; status: string; orderId: string | null; payDeadline: string | null }> };

export function GroupBuysDashboard() {
  const t = useT("together");
  const { money, day } = useFormat();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    call<{ groups: Group[] }>("/api/app/together?view=groups").then((data) => setGroups(data.groups)).catch((err: Error) => setError(err.message || t("loadFailed")));
  }, [t]);
  useEffect(load, [load]);

  async function close(groupId: string) {
    if (!(await confirmDialog(t("confirm")))) return;
    setBusy(true);
    try {
      await act({ action: "group.cancel", groupId });
      setNote({ tone: "success", text: t("saved") });
      load();
    } catch (err) {
      setNote({ tone: "error", text: (err as Error).message || t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (error && !groups) return <p className="text-app-danger">{error}</p>;
  if (!groups) return <p className="text-app-ink-soft">…</p>;
  if (!groups.length) return <Box><p className="m-0 text-[14.5px] text-app-ink-soft">{t("groups.empty")}</p></Box>;
  return (
    <div className="grid gap-3">
      <Message message={note} />
      {groups.map((group) => (
        <Box key={group.id} className="grid gap-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{group.productName}{group.variantLabel ? ` · ${group.variantLabel}` : ""}</div>
            <StatusPill status={group.status} />
          </div>
          <div className="text-[13.5px] text-app-ink-soft">{t("groups.line", { joined: group.joined, size: group.size, price: money(group.price), date: day(group.endsAt) })}</div>
          {group.members.length ? (
            <ul className="m-0 grid list-none gap-1 p-0 text-[13.5px]">
              {group.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{member.name}{member.phone ? ` · ${member.phone}` : ""}</span>
                  <StatusPill status={member.status} />
                  {member.orderId ? <Link href={`/home/orders/${member.orderId}`} className="font-bold text-app-accent-ink">{t("plans.order")}</Link> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {group.status === "open" ? <div><Button tone="danger" disabled={busy} onClick={() => void close(group.id)}>{t("groups.close")}</Button></div> : null}
        </Box>
      ))}
    </div>
  );
}
