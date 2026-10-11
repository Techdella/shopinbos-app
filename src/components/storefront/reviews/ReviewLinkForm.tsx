"use client";

import { useState } from "react";
import { PhotoPicker } from "./PhotoPicker";
import { StarInput } from "./StarInput";

interface Item {
  productId: string;
  name: string;
  image: string | null;
  alreadyReviewed: boolean;
}

// The page buyers reach from a review request: rate every item in the order in one go.
export function ReviewLinkForm({ slug, token, buyerName, items, storeName }: { slug: string; token: string; buyerName: string; items: Item[]; storeName: string }) {
  const open = items.filter((item) => !item.alreadyReviewed);
  const [name, setName] = useState(buyerName);
  const [entries, setEntries] = useState(() => Object.fromEntries(open.map((item) => [item.productId, { rating: 0, title: "", body: "", images: [] as string[] }])));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ published: boolean } | null>(null);
  const [error, setError] = useState("");
  const input = "w-full rounded-[10px] border border-black/15 bg-white px-3 text-[16px] outline-none focus:border-black/50 sm:text-[15px]";

  const update = (id: string, patch: Partial<(typeof entries)[string]>) => setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  async function submit() {
    const reviews = Object.entries(entries).filter(([, entry]) => entry.rating).map(([productId, entry]) => ({ productId, ...entry }));
    if (!reviews.length) {
      setError("Rate at least one item.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, buyerName: name, reviews }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) setDone({ published: Boolean(json?.data?.published) });
    else setError(json?.error?.message ?? "Your review couldn't be sent. Try again.");
  }

  if (done) {
    return (
      <div role="status" className="rounded-[16px] bg-[#ECFDF3] p-6 text-center">
        <h2 className="m-0 text-[20px] font-semibold text-[#067647]">Thank you, {name.split(" ")[0] || "friend"}!</h2>
        <p className="m-0 mt-2 text-[15px]">{done.published ? `Your review is now on ${storeName}.` : `${storeName} will publish your review shortly.`}</p>
      </div>
    );
  }

  if (!open.length) {
    return <p className="rounded-[16px] bg-black/[0.04] p-6 text-center text-[15px]">You&apos;ve already reviewed everything in this order. Thank you!</p>;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4">
      <label className="grid gap-1 text-[13px] font-semibold">Name shown with your review<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={`${input} h-11`} autoComplete="name" /></label>
      {open.map((item) => {
        const entry = entries[item.productId];
        return (
          <section key={item.productId} className="grid gap-3 rounded-[16px] border border-black/10 bg-white p-4" aria-label={item.name}>
            <div className="flex items-center gap-3">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
              ) : null}
              <h2 className="m-0 min-w-0 text-[16px] font-semibold">{item.name}</h2>
            </div>
            <StarInput name={`rating-${item.productId}`} value={entry.rating} onChange={(rating) => update(item.productId, { rating })} />
            {entry.rating ? (
              <>
                <label className="grid gap-1 text-[13px] font-semibold">Headline <span className="font-normal opacity-60">(optional)</span><input value={entry.title} onChange={(e) => update(item.productId, { title: e.target.value })} maxLength={200} className={`${input} h-11`} /></label>
                <label className="grid gap-1 text-[13px] font-semibold">Your review<textarea value={entry.body} onChange={(e) => update(item.productId, { body: e.target.value })} rows={3} maxLength={5000} className={`${input} py-2`} placeholder="What did you think?" /></label>
                <div className="grid gap-1 text-[13px] font-semibold">Photos <span className="font-normal opacity-60">(optional)</span>
                  <PhotoPicker slug={slug} proof={{ token }} photos={entry.images} onChange={(images) => update(item.productId, { images })} />
                </div>
              </>
            ) : null}
          </section>
        );
      })}
      {items.length > open.length ? <p className="m-0 text-[13px] opacity-70">Items you already reviewed aren&apos;t shown.</p> : null}
      {error ? <p role="alert" className="m-0 text-[14px] text-[#B42318]">{error}</p> : null}
      <button type="submit" disabled={busy} className="inline-flex min-h-[50px] w-full items-center justify-center rounded-full bg-[#16141F] px-6 text-[16px] font-semibold text-white disabled:opacity-60 sm:w-fit">{busy ? "Sending…" : "Send my review"}</button>
    </form>
  );
}
