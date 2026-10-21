import { withAuth } from "@/lib/auth/middleware";

// Status is for the three business roles (shared/status.ts); admins and customers have no Status row.
export const withStatusUser = (handler: Parameters<typeof withAuth>[0]) => withAuth(handler, ["seller", "supplier", "logistics_partner"]);

/** A post id from the URL (a cuid), or null. */
export function postId(value: unknown) {
  const id = String(value ?? "");
  return /^[a-z0-9]{10,40}$/i.test(id) ? id : null;
}
