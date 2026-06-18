import { redirect } from "next/navigation";

export default async function PublicStoreAliasPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  redirect(`/s/${storeSlug}`);
}
