import { NextResponse } from "next/server";
import { SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";
import { storeLlmsFullTxt, storeLlmsTxt } from "@/lib/seo/llms";
import { loadStoreLlms, onRequestHost, storeSearchState, storeUrl } from "@/lib/seo/store-seo.server";

// Shared by /llms.txt and /llms-full.txt: served on the store's canonical address (its other addresses redirect
// there), only for live stores the seller hasn't hidden from search engines.

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

export async function llmsResponse(request: Request, slug: string, kind: "short" | "full") {
  const state = await storeSearchState(slug);
  if (!state?.indexable) return notFound();
  const canonical = storeUrl(state.store, kind === "full" ? "/llms-full.txt" : "/llms.txt");
  if (!onRequestHost(canonical, request.headers.get("host"))) return NextResponse.redirect(canonical, 301);
  const input = await loadStoreLlms(slug, kind === "full" ? 2000 : 200);
  if (!input) return notFound();
  return new NextResponse(kind === "full" ? storeLlmsFullTxt(input) : storeLlmsTxt(input), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL },
  });
}
