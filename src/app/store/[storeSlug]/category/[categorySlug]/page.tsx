import { redirect } from "next/navigation";

// Old /store category links: categories are browsed on the storefront's shop page now.
export default async function PublicStoreCategoryAliasPage({ params }: { params: Promise<{ storeSlug: string; categorySlug: string }> }) {
  const { storeSlug } = await params;
  redirect(`/s/${storeSlug}?page=products`);
}
