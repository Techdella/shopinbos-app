"use client";

import { useState } from "react";
import { chooseFile, uploadToMyMedia } from "@/components/media/media-client";
import { friendlyError } from "@/lib/errors/report-client";

// "Pack it the seller's way" on a dropship order (Supplier & Dropship Rules, shared/dropship-rules.ts packChecklist):
// the steps to tick (pack plain, the seller's slip or sticker, the order code) and the photo of the sealed parcel,
// which protects the supplier in a dispute. "I've packed it" (PickupBooking) is refused until all of it is done.
// Talks to /api/supplier/orders/[id]/pack; the photo goes up through the media library first.

export interface PackStepView {
  id: string;
  text: string;
  detail: string;
  done: boolean;
}

export interface PackViewData {
  orderId: string;
  steps: PackStepView[];
  packSteps: string[];
  photoUrl: string | null;
  packed: boolean;
  problem: string | null;
}

export function PackChecklist({ initial, editable }: { initial: PackViewData; editable: boolean }) {
  const [view, setView] = useState<PackViewData>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { steps?: string[]; photoUrl?: string | null }, label: string) {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(`/api/supplier/orders/${encodeURIComponent(view.orderId)}/pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as { data?: PackViewData; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "That didn't save. Try again.");
      setView(json.data);
    } catch (sendError) {
      setError(sendError instanceof Error ? friendlyError(sendError) : "That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const toggle = (id: string) => {
    const next = view.packSteps.includes(id) ? view.packSteps.filter((step) => step !== id) : [...view.packSteps, id];
    void send({ steps: next }, id);
  };

  async function snap() {
    const file = await chooseFile("image/*");
    if (!file) return;
    setBusy("photo");
    setError(null);
    try {
      const asset = await uploadToMyMedia(file, "image");
      await send({ photoUrl: asset.url }, "photo");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? friendlyError(uploadError) : "The photo didn't upload. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2 p-0">
        {view.steps.map((step) => {
          const photo = step.id === "photo";
          return (
            <li key={step.id} className={`flex items-center gap-3 rounded-[16px] border px-4 py-3 ${step.done ? "border-app-success bg-app-success-tint" : "border-app-line bg-white"}`}>
              {photo ? (
                <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${step.done ? "border-app-success bg-app-success text-white" : "border-app-line-strong"}`}>{step.done ? "✓" : ""}</span>
              ) : (
                <input
                  type="checkbox"
                  aria-label={step.text}
                  checked={step.done}
                  disabled={!editable || Boolean(busy)}
                  onChange={() => toggle(step.id)}
                  className="h-6 w-6 shrink-0 accent-[#16141F]"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{step.text}</span>
                <span className="block text-[13px] text-app-ink-soft">{step.detail}</span>
              </span>
              {photo && editable && (
                <button type="button" onClick={() => void snap()} disabled={Boolean(busy)} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-app-ink px-4 text-[14px] font-bold text-white disabled:opacity-60">
                  {busy === "photo" ? "Uploading…" : step.done ? "Retake" : "Snap"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {view.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={view.photoUrl} alt="The sealed parcel" className="max-h-[220px] w-auto rounded-[16px] border border-app-line object-contain" />
      )}
      {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14.5px] font-bold text-app-danger">{error}</p>}
      {editable && view.problem && <p className="m-0 text-[13.5px] text-app-ink-soft">{view.problem} You can mark it packed once every step is done.</p>}
    </div>
  );
}
