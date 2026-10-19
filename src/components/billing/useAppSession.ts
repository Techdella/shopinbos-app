"use client";

import { useSyncExternalStore } from "react";
import { hasAppSessionCookie } from "@/lib/app-session";

const subscribe = () => () => {};

/** True on a page the phone app opened (see src/lib/app-session.ts): hide anything that sells a digital item. */
export function useAppSession() {
  return useSyncExternalStore(subscribe, () => hasAppSessionCookie(document.cookie), () => false);
}
