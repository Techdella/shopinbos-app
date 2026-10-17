"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { asAccountRole, PORTAL_NOTE_PARAM } from "@/lib/auth/role-rules";
import { portalRoleFromPath } from "@/lib/portal-routes";

/**
 * Someone logged in on another portal's page (a seller on the supplier log-in) and was sent to their own home with
 * ?portal_note=<the page they used>. Says why they landed here ("You have a seller account, so we opened your
 * shop.") once, then drops the note from the address.
 */
export function PortalNote() {
  const { toast } = useToast();
  const t = useT("ui");
  useEffect(() => {
    const url = new URL(window.location.href);
    const tried = asAccountRole(url.searchParams.get(PORTAL_NOTE_PARAM));
    if (!url.searchParams.has(PORTAL_NOTE_PARAM)) return;
    url.searchParams.delete(PORTAL_NOTE_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const here = portalRoleFromPath(url.pathname);
    if (tried && tried !== here) toast(t(`portalNote.${here}`), "info");
  }, [toast, t]);
  return null;
}
