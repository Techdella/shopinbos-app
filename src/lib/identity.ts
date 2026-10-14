import "server-only";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { removeFileByPublicUrl, uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { isInLibrary, recordMedia } from "@/lib/media/library.server";
import { identityImageProblem, logoLabelFor, type IdentityImageKind } from "@shared/identity-images";

// The person's photo and their business logo, read and changed in one place so the app shell, profile pages,
// storefront and marketplace all show the same picture.

export interface Identity {
  name: string;
  avatarUrl: string | null;
  /** Store logo (seller), business logo (supplier) or company logo (delivery partner). */
  logoUrl: string | null;
  logoLabel: string | null;
  /** Store, supplier or company name the logo belongs to. */
  businessName: string | null;
}

type Owner = { id: string; role: string };

async function logoOwner(user: Owner) {
  if (user.role === "seller") {
    const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, logoUrl: true } });
    return store ? { kind: "store" as const, id: store.id, name: store.name, logoUrl: store.logoUrl } : null;
  }
  if (user.role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, slug: true, logoUrl: true } });
    return supplier ? { kind: "supplier" as const, id: supplier.id, name: supplier.displayName, slug: supplier.slug, logoUrl: supplier.logoUrl } : null;
  }
  if (user.role === "logistics_partner") {
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, slug: true, logoUrl: true } });
    return partner ? { kind: "partner" as const, id: partner.id, name: partner.displayName, slug: partner.slug, logoUrl: partner.logoUrl } : null;
  }
  return null;
}

export async function getIdentity(user: Owner): Promise<Identity> {
  const [row, owner] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { name: true, avatarUrl: true } }),
    logoOwner(user),
  ]);
  return {
    name: row?.name ?? "",
    avatarUrl: row?.avatarUrl ?? null,
    logoUrl: owner?.logoUrl ?? null,
    logoLabel: owner ? logoLabelFor(user.role) : null,
    businessName: owner?.name ?? null,
  };
}

export class IdentityImageError extends Error {}

/** Saves (file) or removes (null) the person's photo or logo, then returns the updated identity. */
export async function setIdentityImage(user: Owner, kind: IdentityImageKind, file: File | null): Promise<Identity> {
  if (file) {
    const problem = identityImageProblem(file);
    if (problem) throw new IdentityImageError(problem);
  }

  if (kind === "avatar") {
    const current = await db.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    const url = file ? (await uploadFileServer("avatars", file, uploadPath(`avatars/${user.id}`, file))).publicUrl : null;
    await db.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    if (current?.avatarUrl !== url) await removeFileByPublicUrl(current?.avatarUrl);
    return getIdentity(user);
  }

  const owner = await logoOwner(user);
  if (!owner) throw new IdentityImageError(user.role === "seller" ? "Create your store first, then add its logo." : "There's no business profile to add a logo to yet.");
  let url: string | null = null;
  if (owner.kind === "store") {
    url = file ? (await uploadFileServer("brand", file, uploadPath(`logos/store/${owner.id}`, file))).publicUrl : null;
    await db.store.update({ where: { id: owner.id }, data: { logoUrl: url } });
  } else if (owner.kind === "supplier") {
    url = file ? (await uploadFileServer("supplier-logos", file, uploadPath(`supplier-logos/${owner.id}`, file))).publicUrl : null;
    await db.supplier.update({ where: { id: owner.id }, data: { logoUrl: url } });
    invalidatePublicMarketplaceCache({ supplierSlug: owner.slug });
  } else {
    url = file ? (await uploadFileServer("logistics-logos", file, uploadPath(`logos/${owner.id}`, file))).publicUrl : null;
    await db.logisticsPartner.update({ where: { id: owner.id }, data: { logoUrl: url } });
    invalidatePublicMarketplaceCache({ logisticsSlug: owner.slug });
  }
  // The new logo joins the media library; the old file stays when it's in the library (it may be used elsewhere).
  if (url) await recordMedia({ userId: user.id, storeId: owner.kind === "store" ? owner.id : null, url, name: "Logo", source: "logo" });
  if (owner.logoUrl !== url && !(await isInLibrary(user.id, owner.logoUrl))) await removeFileByPublicUrl(owner.logoUrl);
  return getIdentity(user);
}
