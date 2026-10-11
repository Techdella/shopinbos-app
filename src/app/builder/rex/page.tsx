import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Rex's chat builder now lives in Rex Studio. Old links keep working: ?tool= opened Rex's image and logo
// tools, which are /studio/images and /studio/logo; every other query (e.g. ?onboarding=true) carries over.
export default async function BuilderRexPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const tool = typeof params.tool === "string" ? params.tool : "";
  if (tool === "logo") redirect("/studio/logo");
  if (["image", "product-img", "banner"].includes(tool)) redirect("/studio/images");

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "tool" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
  }
  const rest = query.toString();
  redirect(rest ? `/studio?${rest}` : "/studio");
}
