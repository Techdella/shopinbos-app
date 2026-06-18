"use client";

import { useRef } from "react";
import { uploadSupplierCover, uploadSupplierLogo, uploadSupplierPhoto } from "@/app/actions/supplier";
import { Icon } from "@/components/ui/Icon";

export function SupplierCoverUpload({ bannerUrl }: { bannerUrl: string | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("cover", e.target.files[0]);
    await uploadSupplierCover(fd);
  }

  return (
    <form ref={formRef} style={{ marginBottom: 14 }}>
      <div style={{
        height: 140, borderRadius: 12,
        background: bannerUrl ? `url(${bannerUrl}) center/cover` : "linear-gradient(135deg, #D4A574, #6B4A2C 50%, #3a2614)",
        position: "relative",
      }}>
        <button type="button" className="dbtn dBtn-ghost" style={{
          position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.9)", cursor: "pointer",
        }} onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={12} /> {bannerUrl ? "Change cover" : "Add cover"}
        </button>
        <input ref={inputRef} type="file" name="cover" accept="image/*" hidden onChange={handleFileChange} />
      </div>
    </form>
  );
}

export function SupplierLogoUpload({ logoUrl, displayName }: { logoUrl: string | null; displayName: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("logo", e.target.files[0]);
    await uploadSupplierLogo(fd);
  }

  return (
    <form ref={formRef} style={{ display: "contents" }}>
      <button type="button" onClick={() => inputRef.current?.click()} style={{ cursor: "pointer", display: "block", background: "none", border: "none", padding: 0 }}>
        <div style={{
          width: 100, height: 100, borderRadius: 18,
          background: logoUrl ? `url(${logoUrl}) center/cover` : "linear-gradient(135deg, var(--amber-500), var(--rose-500))",
          display: "grid", placeItems: "center", color: "white",
          fontFamily: "var(--font-accent)", fontWeight: 600, fontSize: 36,
          position: "relative", overflow: "hidden",
        }}>
          {!logoUrl && displayName.split(" ").map((p) => p[0]).join("").slice(0, 2)}
        </div>
      </button>
      <input ref={inputRef} type="file" name="logo" accept="image/*" hidden onChange={handleFileChange} />
    </form>
  );
}

export function SupplierPhotoUpload() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("photo", e.target.files[0]);
    await uploadSupplierPhoto(fd);
  }

  return (
    <form ref={formRef} style={{ display: "inline" }}>
      <button type="button" className="dbtn dBtn-ghost" style={{ cursor: "pointer" }} onClick={() => inputRef.current?.click()}>
        <Icon name="upload" size={12} /> Add photo
      </button>
      <input ref={inputRef} type="file" name="photo" accept="image/*" hidden onChange={handleFileChange} />
    </form>
  );
}