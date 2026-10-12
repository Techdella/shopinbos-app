import { redirect } from "next/navigation";

// Old /store links: the bag lives on the storefront itself, so shoppers keep the same items.
export default async function PublicStoreCartAliasPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  redirect(`/s/${storeSlug}/cart`);
}
