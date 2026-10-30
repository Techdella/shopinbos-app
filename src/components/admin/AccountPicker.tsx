"use client";

import { useRef, useState } from "react";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { ACCOUNT_ROLE_LABEL, type AccountRole } from "@shared/admin-accounts";

// Pick a seller, supplier or delivery partner from a list (Admin › Accounts, Admin › Pricing › Gifts and free plans):
// a role filter and one dropdown grouped by role, which opens the person as soon as they're picked. Without
// JavaScript the Open button does it (the list then shows every role).

type Choices = Record<AccountRole, Array<{ id: string; label: string }>>;

const ROLES = Object.keys(ACCOUNT_ROLE_LABEL) as AccountRole[];

export function AccountPicker({ action, choices, selected, anchor }: { action: string; choices: Choices; selected?: string | null; anchor?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const selectedRole = ROLES.find((role) => choices[role].some((choice) => choice.id === selected)) ?? "all";
  const [role, setRole] = useState<AccountRole | "all">(selectedRole);
  const shown = role === "all" ? ROLES : [role];

  return (
    <form ref={form} method="get" action={anchor ? `${action}#${anchor}` : action} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1.5 text-[13px] font-bold">
        Who
        <select aria-label="Show" value={role} onChange={(event) => setRole(event.target.value as AccountRole | "all")} className={`${fieldClass} min-w-[170px]`}>
          <option value="all">Everyone</option>
          {ROLES.map((value) => (
            <option key={value} value={value}>{ACCOUNT_ROLE_LABEL[value]} ({choices[value].length})</option>
          ))}
        </select>
      </label>
      <label className="grid min-w-[260px] flex-1 gap-1.5 text-[13px] font-bold">
        Person
        <select name="user" defaultValue={selected ?? ""} key={role} required onChange={() => form.current?.requestSubmit()} className={fieldClass}>
          <option value="" disabled>Pick someone…</option>
          {shown.map((value) => (
            <optgroup key={value} label={ACCOUNT_ROLE_LABEL[value]}>
              {choices[value].map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <button type="submit" className={buttonClass("ink")}>Open</button>
    </form>
  );
}
