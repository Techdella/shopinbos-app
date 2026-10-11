"use client";

import { useState } from "react";
import { PhotoPicker } from "./PhotoPicker";
import { StarInput } from "./StarInput";

// "Write a review" on the product page. Buyers prove the purchase with their order number and email; the
// seller publishes it (or it goes live straight away if they turned that on).
export function ProductReviewForm({ slug, productId, productName, accent = "#16141F", ink = "#16141F" }: { slug: string; productId: string; productName: string; accent?: string; ink?: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [proof, setProof] = useState({ orderNumber: "", email: "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = "h-11 w-full rounded-[10px] border border-black/15 bg-white px-3 text-[16px] outline-none focus:border-black/50 sm:text-[15px]";

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    if (!rating) {
      setStatus({ ok: false, text: "Choose a star rating." });
      return;
    }
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        orderNumber: proof.orderNumber,
        buyerEmail: proof.email,
        buyerName: String(data.get("buyerName") || ""),
        rating,
        title: String(data.get("title") || ""),
        body: String(data.get("body") || ""),
        images: photos,
      }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setStatus({ ok: true, text: json?.data?.published ? "Thank you! Your review is live." : "Thank you! Your review will appear once the shop has checked it." });
      form.reset();
      setRating(0);
      setPhotos([]);
    } else setStatus({ ok: false, text: json?.error?.message ?? "Your review couldn't be sent. Try again." });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[44px] items-center rounded-full border px-5 text-[14px] font-semibold" style={{ borderColor: ink, color: ink, background: "transparent" }}>
        Write a review
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }} className="grid max-w-[640px] gap-3 rounded-[14px] border border-black/10 bg-white p-4 text-left sm:p-5" style={{ color: ink }} aria-label={`Review ${productName}`}>
      <h3 className="m-0 text-[17px] font-semibold">Review {productName}</h3>
      <StarInput name={`rating-${productId}`} value={rating} onChange={setRating} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] font-semibold">Order number<input required value={proof.orderNumber} onChange={(e) => setProof({ ...proof, orderNumber: e.target.value })} className={input} autoComplete="off" /></label>
        <label className="grid gap-1 text-[13px] font-semibold">Email used for the order<input required type="email" value={proof.email} onChange={(e) => setProof({ ...proof, email: e.target.value })} className={input} autoComplete="email" /></label>
      </div>
      <label className="grid gap-1 text-[13px] font-semibold">Your name<input name="buyerName" required maxLength={120} className={input} autoComplete="name" /></label>
      <label className="grid gap-1 text-[13px] font-semibold">Headline <span className="font-normal opacity-60">(optional)</span><input name="title" maxLength={200} className={input} /></label>
      <label className="grid gap-1 text-[13px] font-semibold">Your review<textarea name="body" rows={4} maxLength={5000} className={`${input} h-auto py-2`} placeholder="What did you like? How was the quality, fit, delivery?" /></label>
      {proof.orderNumber && proof.email.includes("@") ? (
        <div className="grid gap-1 text-[13px] font-semibold">Photos <span className="font-normal opacity-60">(optional)</span>
          <PhotoPicker slug={slug} proof={{ orderNumber: proof.orderNumber, email: proof.email }} photos={photos} onChange={setPhotos} />
        </div>
      ) : <p className="m-0 text-[12.5px] opacity-60">Add your order number and email to attach photos.</p>}
      {status ? <p role={status.ok ? "status" : "alert"} className="m-0 text-[14px]" style={{ color: status.ok ? "#067647" : "#B42318" }}>{status.text}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="inline-flex min-h-[44px] items-center rounded-full px-5 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: accent }}>{busy ? "Sending…" : "Send review"}</button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px]">Cancel</button>
      </div>
    </form>
  );
}
