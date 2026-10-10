import { redirect } from "next/navigation";

export default async function PublicStoreOrderSuccessAliasPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  redirect(`/s/${storeSlug}`);
}
