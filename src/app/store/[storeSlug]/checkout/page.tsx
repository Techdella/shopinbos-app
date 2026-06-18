import { redirect } from "next/navigation";

export default async function PublicStoreCheckoutAliasPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  redirect(`/s/${storeSlug}/checkout`);
}
