// Who may open a stored verification document. Paths look like
// "supplier-verifications/<supplierId>/<docType>/<file>" or "logistics-verifications/<partnerId>/…". Pure.

const FOLDERS = { supplier: "supplier-verifications", logistics_partner: "logistics-verifications" } as const;

export function verificationFileAllowed(path: string, viewer: { role: string; ownerId: string | null }) {
  if (!path || path.length > 300 || path.includes("..") || path.includes("\\") || path.startsWith("/") || /[\u0000-\u001f]/.test(path)) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return false;
  const [folder, ownerId, ...rest] = path.split("/");
  if (!folder || !ownerId || rest.length < 1 || rest.some((part) => !part)) return false;
  if (viewer.role === "admin") return folder === FOLDERS.supplier || folder === FOLDERS.logistics_partner;
  const own = FOLDERS[viewer.role as keyof typeof FOLDERS];
  return Boolean(own && viewer.ownerId && folder === own && ownerId === viewer.ownerId);
}

/** Where the browser opens a verification document: the signed-link route, never a public storage URL. */
export function verificationFileHref(filePath: string) {
  return `/api/verification/file?path=${encodeURIComponent(filePath)}`;
}
