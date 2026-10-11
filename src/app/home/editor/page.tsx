import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The old store editor lives on as the advanced builder. Old links (/home/editor?page=…) keep their query.
export default async function EditorPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  const query = params.toString();
  redirect(query ? `/seller/store/builder?${query}` : "/seller/store/builder");
}
