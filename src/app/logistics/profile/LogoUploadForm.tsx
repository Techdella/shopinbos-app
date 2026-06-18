"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui";

export function LogoUploadForm({ currentLogo, displayName }: { currentLogo: string | null; displayName: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", border: "3px solid white", background: "var(--ink-100)" }}>
        {currentLogo ? (
          <img src={currentLogo} alt="Logo" style={{ width: 64, height: 64, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 64, height: 64, display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700, color: "var(--ink-400)" }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <form action="/api/logistics/upload-logo" method="POST" encType="multipart/form-data">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="dbtn dBtn-ghost"
          style={{ position: "absolute", bottom: -4, right: -4, padding: "3px 6px", fontSize: 10, background: "var(--paper)", borderRadius: 6, lineHeight: 1 }}
        >
          {uploading ? "..." : <Icon name="upload" size={10} />}
        </button>
        <input ref={fileRef} name="logo" type="file" accept="image/*" style={{ display: "none" }} onChange={() => { setUploading(true); fileRef.current?.form?.requestSubmit(); }} />
      </form>
    </div>
  );
}
