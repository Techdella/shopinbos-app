import { redirect } from "next/navigation";

export default async function PublicStoreBlogAliasPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  redirect(`/s/${storeSlug}/blog`);
}
