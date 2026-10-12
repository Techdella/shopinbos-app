"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton } from "@/components/app-ui";

// "Add a legal page": names a custom page (Warranty, Data deletion…), creates it and opens the editor.
export function AddLegalPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/legal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
      const json = (await res.json().catch(() => null)) as { data?: { key: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) {
        setError(json?.error?.message ?? "Couldn't add the page. Try again.");
        return;
      }
      router.push(`/home/legal/${json.data.key}`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <PillButton tone="accent" size="md" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> Add a legal page
      </PillButton>
    );
  }
  return (
    <form onSubmit={create} className="grid w-full gap-2 sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="legal-new-title" className="sr-only">Page name</label>
        <input
          id="legal-new-title"
          autoFocus
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page name, e.g. Warranty"
          className="min-h-[44px] min-w-0 flex-1 basis-[200px] rounded-full border border-app-line bg-white px-4 text-[14.5px] outline-none focus:border-app-ink"
        />
        <PillButton tone="accent" size="md" type="submit" busy={busy} disabled={busy || !title.trim()}>Add</PillButton>
        <PillButton tone="white" size="md" type="button" onClick={() => { setOpen(false); setError(""); }}>Cancel</PillButton>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}
