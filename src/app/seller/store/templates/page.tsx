import { redirect } from "next/navigation";

export default async function SellerStoreTemplatesAliasPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params?.next ?? "/seller/store/builder";
  redirect(`/builder/templates?next=${encodeURIComponent(next)}`);
}
