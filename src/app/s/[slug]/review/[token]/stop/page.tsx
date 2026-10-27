import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { recordOptOut } from "@/lib/marketing/opt-outs";
import { verifyReviewToken } from "@/lib/reviews/pure";
import { reviewLinkSecret } from "@/lib/reviews/secrets";

// "Stop texts" from a review request sent by SMS or WhatsApp through Shopinbos's own sender (replies to it reach
// nobody, so the text links here instead of saying "Reply STOP"). The signed review link is the credential; it keeps
// working after the review window closes. Opening the page changes nothing (link scanners open links): the button does.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stop messages", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ done?: string }> };

async function findRequest(slug: string, token: string) {
  const requestId = verifyReviewToken(token, reviewLinkSecret());
  if (!requestId) return null;
  const request = await db.reviewRequest.findUnique({ where: { id: requestId }, select: { storeId: true, phone: true, channel: true } }).catch(() => null);
  if (!request?.phone || (request.channel !== "sms" && request.channel !== "whatsapp")) return null;
  const store = await db.store.findUnique({ where: { id: request.storeId }, select: { slug: true, name: true } });
  return store?.slug === slug ? { ...request, channel: request.channel as "sms" | "whatsapp", phone: request.phone, store } : null;
}

async function stop(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug") ?? "");
  const token = String(formData.get("token") ?? "");
  const found = await findRequest(slug, token);
  if (!found) notFound();
  await recordOptOut(found.storeId, found.phone, found.channel, { scope: "marketing", source: "review_link" });
  redirect(`/s/${encodeURIComponent(slug)}/review/${encodeURIComponent(token)}/stop?done=1`);
}

export default async function StopTextsPage({ params, searchParams }: Props) {
  const { slug, token: raw } = await params;
  const token = decodeURIComponent(raw);
  const found = await findRequest(slug, token);
  if (!found) notFound();
  const done = (await searchParams).done === "1";
  const channel = found.channel === "sms" ? "SMS" : "WhatsApp";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#FAF7F1] px-4 py-10 text-[#0E2A38]">
      <div className="w-full max-w-[440px] rounded-[18px] border border-[#0E2A38]/[0.08] bg-white p-7">
        {done ? (
          <>
            <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">Done</h1>
            <p className="mb-0 mt-2 text-[15px] leading-[1.5] text-[#41545E]">{found.store.name} won&apos;t send you review requests or offers by {channel} any more. Messages about your orders still arrive.</p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">Stop {channel} messages from {found.store.name}?</h1>
            <p className="mb-5 mt-2 text-[15px] leading-[1.5] text-[#41545E]">You won&apos;t get review requests or offers from {found.store.name} by {channel}. Messages about your orders still arrive.</p>
            <form action={stop}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="min-h-[48px] rounded-full bg-[#0E2A38] px-6 text-[15px] font-semibold text-[#F4F1EA]">Yes, stop {channel} messages</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
