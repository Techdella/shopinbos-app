import type { OrderItemForReview } from "@/lib/reviews/public";
import { ReviewLinkForm } from "./ReviewLinkForm";

export function ReviewLinkPage({ state, slug, token, basePath }: {
  state: { error: "invalid" | "expired" | null; store?: { name: string; logoUrl: string | null }; order?: { orderNumber: string; buyerName: string }; items?: OrderItemForReview[] };
  slug: string;
  token: string;
  basePath: string;
}) {
  const home = basePath || "/";
  return (
    <main className="min-h-screen bg-[#FAF8F5] px-4 py-8 text-[#16141F] sm:px-8">
      <div className="mx-auto grid w-full max-w-[680px] gap-6">
        <header className="flex items-center gap-3">
          {state.store?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.store.logoUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : null}
          <a href={home} className="text-[18px] font-semibold text-inherit no-underline">{state.store?.name ?? "Shop"}</a>
        </header>
        {state.error ? (
          <div className="rounded-[16px] border border-black/10 bg-white p-6">
            <h1 className="m-0 text-[22px] font-semibold">{state.error === "expired" ? "This review link has expired" : "This review link doesn't work"}</h1>
            <p className="m-0 mt-2 text-[15px] opacity-75">You can still review a product from its page using your order number and email.</p>
            <a href={home} className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-[#16141F] px-5 text-[14px] font-semibold text-white no-underline">Go to the shop</a>
          </div>
        ) : (
          <>
            <div>
              <h1 className="m-0 text-[26px] font-semibold leading-tight">How was your order?</h1>
              <p className="m-0 mt-2 text-[15px] opacity-75">Order {state.order?.orderNumber}. Rate what you bought. Your review helps other shoppers and {state.store?.name}.</p>
            </div>
            <ReviewLinkForm slug={slug} token={token} buyerName={state.order?.buyerName ?? ""} items={state.items ?? []} storeName={state.store?.name ?? "the shop"} />
          </>
        )}
      </div>
    </main>
  );
}
