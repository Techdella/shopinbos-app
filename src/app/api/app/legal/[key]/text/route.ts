import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { docFromEditedText, isStandardLegalKey, legalPagePath, legalPageStatus, legalPageText, type LegalPage } from "@/lib/legal/pages";
import { LegalError, legalStore, saveLegalPage, sellerLegalPage } from "@/lib/legal/server";
import { legalFailure, noStore, notFound } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One legal page as plain text, for the phone app (the web edits the rich document through ../route.ts).
//   GET → { data: { key, title, text, textEditable, published, status, updatedAt, standard, url } }
//   PUT { title, text?, published } → the same. Leave text out (or unchanged) to keep the stored document as it
//       is, e.g. to Publish or Unpublish. Saving goes through saveLegalPage, so the rules match the web: a title is
//       needed, an empty page can't be published, the size limit.

const Body = z.object({
  title: z.string().trim().min(1, "Add a title").max(120),
  text: z.string().max(200_000, "This page is too long to save. Split it into two pages.").optional(),
  published: z.boolean(),
});

function view(page: LegalPage, store: { slug: string; customDomain: string | null }) {
  return {
    key: page.key,
    title: page.title,
    ...legalPageText(page.doc),
    published: page.published,
    status: legalPageStatus(page),
    updatedAt: page.updatedAt,
    standard: isStandardLegalKey(page.key),
    url: `${buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain })}${legalPagePath(page.key)}`,
  };
}

export const GET = withSeller(async (_req, { user, params }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  const page = sellerLegalPage(store, String(params.key));
  return page ? NextResponse.json({ data: view(page, store) }) : notFound();
});

export const PUT = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await legalStore(user.id);
  if (!store) return noStore();
  const page = sellerLegalPage(store, String(params.key));
  if (!page) return notFound();
  try {
    const input = Body.parse(await req.json().catch(() => ({})));
    const next = docFromEditedText(page.doc, input.text);
    if ("error" in next) throw new LegalError(next.error, 409, "CONFLICT");
    const saved = await saveLegalPage(store, page.key, { title: input.title, doc: next.doc, style: page.style, seo: page.seo, published: input.published });
    return NextResponse.json({ data: view(saved, store) });
  } catch (error) {
    return legalFailure(error);
  }
});
