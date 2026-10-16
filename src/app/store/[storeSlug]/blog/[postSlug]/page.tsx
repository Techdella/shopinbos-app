import { permanentRedirect } from "next/navigation";

export default async function PublicStoreBlogPostAliasPage({ params }: { params: Promise<{ storeSlug: string; postSlug: string }> }) {
  const { storeSlug, postSlug } = await params;
  permanentRedirect(`/s/${storeSlug}/blog/${postSlug}`);
}
