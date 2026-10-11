import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { readUnsubscribeToken } from "@/lib/marketing/brand";
import { unsubscribe } from "@/lib/marketing/subscribers";

// Unsubscribe links in automation emails (campaign emails use /email/unsubscribe/<token>).
// GET shows a confirm button (link scanners prefetch GETs, so a GET alone never unsubscribes);
// POST unsubscribes — the button, and mail apps' one-click List-Unsubscribe-Post.

function page(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#F6F5F9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16141F">
<main style="max-width:460px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #E6E1F0;border-radius:22px">${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const target = readUnsubscribeToken(token);
  if (!target) return page("Link not valid", `<h1 style="font-size:22px;margin:0 0 8px">This link isn't valid</h1><p style="margin:0;color:#5B5868">It may be incomplete. Reply to the email and ask the shop to remove you.</p>`);
  const store = await db.store.findUnique({ where: { id: target.storeId }, select: { name: true } });
  return page(
    "Unsubscribe",
    `<h1 style="font-size:22px;margin:0 0 8px">Stop emails from ${esc(store?.name ?? "this shop")}?</h1>
<p style="margin:0 0 18px;color:#5B5868">${esc(target.email)} won't get marketing emails from this shop any more.</p>
<form method="post"><input type="hidden" name="t" value="${esc(token!)}"><button style="min-height:44px;padding:0 22px;border:0;border-radius:999px;background:#16141F;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = req.nextUrl.searchParams.get("t") ?? (form?.get("t") as string | null);
  const target = readUnsubscribeToken(token);
  if (!target) return page("Link not valid", `<h1 style="font-size:22px;margin:0">This link isn't valid</h1>`);
  await unsubscribe(target.storeId, target.email, "automation_email");
  const store = await db.store.findUnique({ where: { id: target.storeId }, select: { name: true } });
  return page("Unsubscribed", `<h1 style="font-size:22px;margin:0 0 8px">You're unsubscribed</h1><p style="margin:0;color:#5B5868">${esc(store?.name ?? "This shop")} won't send marketing emails to ${esc(target.email)} any more.</p>`);
}
