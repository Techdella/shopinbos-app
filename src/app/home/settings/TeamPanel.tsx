"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyExtraButton } from "@/components/plans/BuyExtraButton";
import { FIELD_INPUT, SUBMIT_INK } from "@/components/seller-settings/fields";
import { inviteStaffAction, removeStaffAction } from "@/app/actions/staff";

// Settings › Team: the owner, the people they've added (invited or joined), seats left, and an extra seat for
// this month when the plan's seats are used up (src/lib/staff/staff.server.ts).

export interface TeamPanelProps {
  owner: { name: string; email: string | null; avatarUrl?: string | null };
  staff: Array<{ id: string; name: string; email: string; status: string }>;
  seats: { included: number; extra: number; total: number; used: number };
  seatPrice: string;
}

export function TeamPanel({ owner, staff, seats, seatPrice }: TeamPanelProps) {
  const t = useT("account");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string; link?: string } | null>(null);
  const full = seats.used >= seats.total;
  const initials = owner.name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);

  function invite(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await inviteStaffAction({ name, email });
      if (!result.ok) return setNotice({ tone: "error", text: result.error });
      setName("");
      setEmail("");
      setNotice(result.message ? { tone: "ok", text: t("team.noEmail"), link: result.message } : { tone: "ok", text: t("team.sent") });
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const result = await removeStaffAction(id);
      if (!result.ok) setNotice({ tone: "error", text: result.error });
      router.refresh();
    });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHead
          title={t("team.title")}
          sub={t("team.seats", { used: seats.used, total: seats.total })}
          className="px-5 pb-3 pt-5"
        />
        <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
          <li className="flex items-center gap-3 px-5 py-3.5">
            {owner.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={owner.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-[14px] font-extrabold text-white">{initials}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-extrabold">{owner.name}</div>
              <div className="truncate text-[13px] text-app-ink-soft">{owner.email} · {t("team.owner")}</div>
            </div>
            <Pill tone="ink">{t("team.you")}</Pill>
          </li>
          {staff.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={member.status === "active" ? "user" : "mail"} size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold">{member.name}</div>
                <div className="truncate text-[13px] text-app-ink-soft">{member.email}</div>
              </div>
              <Pill tone={member.status === "active" ? "success" : "warning"}>{member.status === "active" ? t("team.joined") : t("team.invited")}</Pill>
              <button type="button" onClick={() => remove(member.id)} disabled={pending} className="min-h-[40px] rounded-full px-3 text-[13px] font-bold text-app-danger hover:bg-app-canvas disabled:opacity-55">
                {t("team.remove")}
              </button>
            </li>
          ))}
        </ul>
        <p className="m-0 border-t border-app-line px-5 py-3 text-[13px] text-app-ink-soft">{t("team.staffCan")}</p>
      </Card>

      <Card className="p-5">
        <form onSubmit={invite}>
          <h2 className="m-0 mb-3 text-[17px] font-extrabold">{t("team.invite")}</h2>
          <div className="flex flex-wrap gap-3">
            <input aria-label={t("team.name")} value={name} onChange={(event) => setName(event.target.value)} className={`${FIELD_INPUT} flex-1 basis-[160px]`} placeholder={t("team.name")} />
            <input aria-label={t("team.email")} value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={`${FIELD_INPUT} flex-1 basis-[220px]`} placeholder="colleague@email.com" />
            <button type="submit" disabled={pending || full} className={SUBMIT_INK}><Icon name="plus" size={16} /> {t("team.send")}</button>
          </div>
        </form>
        {notice ? (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`mb-0 mt-3 text-[13.5px] ${notice.tone === "error" ? "text-app-danger" : "text-app-success"}`}>
            {notice.text}
            {notice.link ? <span className="mt-1 block break-all font-mono text-[12.5px] text-app-ink">{notice.link}</span> : null}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
          <p className="m-0 min-w-0 flex-1 text-[13.5px] text-app-ink-soft">
            {full ? t("team.full", { price: seatPrice }) : t("team.extraSeat", { price: seatPrice })}
            {seats.extra > 0 ? ` ${t("team.extraNow", { count: seats.extra })}` : ""}
          </p>
          <BuyExtraButton kind="staff_seat" label={t("team.addSeat", { price: seatPrice })} />
        </div>
      </Card>
    </>
  );
}
