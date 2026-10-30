"use client";

import { useState } from "react";
import { chooseFile, uploadToMyMedia } from "@/components/media/media-client";
import { friendlyError } from "@/lib/errors/report-client";
import { Icon } from "@/components/ui/Icon";

// "Pack it plain" on a dropship order (Supplier & Dropship Rules, shared/dropship-rules.ts packChecklist): always blind,
// a photo of the item in the open box, the steps to tick (pack plain with no price tag, the order code) and
// the photo of the sealed parcel: the two photos protect the supplier in a dispute (shared/fault-matrix.ts). "I've
// packed it" (PickupBooking) is refused until all of it is done. Talks to /api/supplier/orders/[id]/pack (?kind=wholesale
// for a bulk order: only the two photos); the photos go up through the media library first.

export interface PackStepView {
  id: string;
  text: string;
  detail: string;
  done: boolean;
}

export interface PackViewData {
  orderId: string;
  kind?: "dropship" | "wholesale";
  steps: PackStepView[];
  packSteps: string[];
  photoUrl: string | null;
  /** The item in the open box, before sealing. */
  contentsPhotoUrl?: string | null;
  packed: boolean;
  problem: string | null;
}

const PHOTO_STEPS = new Set(["photo", "contents"]);

export function PackChecklist({ initial, editable }: { initial: PackViewData; editable: boolean }) {
  const [view, setView] = useState<PackViewData>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { steps?: string[]; photoUrl?: string | null; contentsPhotoUrl?: string | null }, label: string) {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(`/api/supplier/orders/${encodeURIComponent(view.orderId)}/pack${view.kind === "wholesale" ? "?kind=wholesale" : ""}`, {
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

  async function snap(which: "photo" | "contents") {
    const file = await chooseFile("image/*");
    if (!file) return;
    setBusy(which);
    setError(null);
    try {
      const asset = await uploadToMyMedia(file, "image");
      await send(which === "contents" ? { contentsPhotoUrl: asset.url } : { photoUrl: asset.url }, which);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? friendlyError(uploadError) : "The photo didn't upload. Try again.");
      setBusy(null);
    }
  }

  const left = view.steps.filter((step) => !step.done).length;
  const box = (done: boolean) => (
    <span aria-hidden className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] border-2 text-white transition ${done ? "border-app-success bg-app-success" : "border-app-locked bg-white"}`}>
      {done ? <Icon name="check" size={15} strokeWidth={3} /> : null}
    </span>
  );

  return (
    <div className="grid gap-2">
      <ul className="m-0 grid list-none gap-2 p-0">
        {view.steps.map((step) => {
          const photo = PHOTO_STEPS.has(step.id);
          const text = (
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold">{step.text}</span>
              <span className="mt-px block text-[12.5px] text-app-ink-soft">{step.detail}</span>
            </span>
          );
          return (
            <li key={step.id}>
              {photo ? (
                <div className="flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-4 py-3">
                  {box(step.done)}
                  {text}
                  <span className="sr-only">{step.done ? "(done)" : "(not yet)"}</span>
                  {editable && (
                    <button type="button" onClick={() => void snap(step.id === "contents" ? "contents" : "photo")} disabled={Boolean(busy)} aria-label={`${step.done ? "Retake" : "Snap"}: ${step.text}`} className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-app-ink px-3 text-[12.5px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 disabled:opacity-60">
                      <Icon name="image" size={13} /> {busy === step.id ? "Uploading…" : step.done ? "Retake" : "Snap"}
                    </button>
                  )}
                </div>
              ) : (
                <label className={`flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink ${editable && !busy ? "cursor-pointer" : "cursor-default"}`}>
                  <input
                    type="checkbox"
                    checked={step.done}
                    disabled={!editable || Boolean(busy)}
                    onChange={() => toggle(step.id)}
                    className="sr-only"
                  />
                  {box(step.done)}
                  {text}
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {view.contentsPhotoUrl || view.photoUrl ? (
        <div className="flex flex-wrap gap-2">
          {view.contentsPhotoUrl ? (
            <figure className="m-0 grid gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.contentsPhotoUrl} alt="The item in the open box" className="h-[160px] w-auto rounded-[16px] border border-app-line object-contain" />
              <figcaption className="text-[12px] text-app-ink-soft">In the open box</figcaption>
            </figure>
          ) : null}
          {view.photoUrl ? (
            <figure className="m-0 grid gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.photoUrl} alt="The sealed parcel" className="h-[160px] w-auto rounded-[16px] border border-app-line object-contain" />
              <figcaption className="text-[12px] text-app-ink-soft">Sealed</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
      {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14.5px] font-bold text-app-danger">{error}</p>}
      {editable && view.problem && (
        <div role="status" className="mt-1 grid gap-1.5">
          <p className="m-0 text-center text-[13px] text-app-gray-ink">{view.problem} You can mark it packed once every step is done.</p>
          {left > 0 && <p className="m-0 grid min-h-[52px] place-items-center rounded-full bg-app-line text-[16px] font-extrabold text-app-ink-soft">{left} {left === 1 ? "step" : "steps"} left</p>}
        </div>
      )}
    </div>
  );
}
