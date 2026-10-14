"use client";

import { useId } from "react";
import { MediaPicker } from "@/components/media/MediaPicker";

// A picture field for Settings → SEO (favicon, link preview): upload one, choose from the media library, or paste
// a link (src/components/media/MediaPicker). Its link goes in a hidden input named `name` for the form to save.

export function SeoImageField({
  name,
  label,
  help,
  initialUrl,
  shape = "wide",
}: {
  name: string;
  label: string;
  help: string;
  initialUrl: string;
  shape?: "square" | "wide";
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={`${id}-choose`} className="mb-1.5 block text-[14px] font-extrabold text-app-ink">{label}</label>
      <MediaPicker id={id} name={name} defaultValue={initialUrl} shape={shape} help={help} />
    </div>
  );
}
