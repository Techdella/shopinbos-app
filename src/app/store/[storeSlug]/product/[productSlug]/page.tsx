import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function PublicStoreProductAliasPage({
  params,
}: {
  params: Promise<{ storeSlug: string; productSlug: string }>;
}) {
  const { storeSlug, productSlug } = await params;
  const store = await db.store.findUnique({
    where: { slug: storeSlug },
    select: {
      id: true,
      status: true,
      storeProducts: {
        where: { status: "published" },
        select: { id: true, name: true },
      },
    },
  });

  if (!store || store.status !== "active") notFound();

  const product = store.storeProducts.find((entry) => (
    entry.id === productSlug || slugify(entry.name) === productSlug
  ));
  if (!product) notFound();

  redirect(`/s/${storeSlug}/product/${product.id}`);
}
