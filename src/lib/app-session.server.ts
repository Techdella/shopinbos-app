import { cookies } from "next/headers";
import { APP_SESSION_COOKIE } from "@/lib/app-session";

/** True on a page the phone app opened (see src/lib/app-session.ts): hide anything that sells a digital item. */
export async function isAppSession() {
  return (await cookies()).get(APP_SESSION_COOKIE)?.value === "1";
}
