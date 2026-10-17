import { permanentRedirect } from "next/navigation";

export default async function PublicStoreAliasPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  permanentRedirect(`/s/${storeSlug}`);
}
