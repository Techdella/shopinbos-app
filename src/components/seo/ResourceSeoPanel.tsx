"use client";

import { useEffect, useState } from "react";
import { Notice, PillButton, Spinner } from "@/components/app-ui";
import { SeoTab } from "@/components/seo/SeoTab";
import { EMPTY_SEO, normalizeSeo, type SeoFields } from "@/lib/seo/fields";

// The SEO tab for things saved through /api/app/seo (product collections): loads, edits and saves on its own.

export function ResourceSeoPanel(props: {
  resourceType: "product" | "collection";
  resourceId: string;
  title: string;
  fallbackDescription?: string;
  slug: string;
  urlPrefix: string;
  siteName: string;
  fallbackImage?: string | null;
}) {
  const [seo, setSeo] = useState<SeoFields>(EMPTY_SEO);
  const [loaded, setLoaded] = useState<SeoFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/app/seo?${new URLSearchParams({ resourceType: props.resourceType, resourceId: props.resourceId })}`)
      .then((res) => (res.ok ? res.json() : { data: {} }))
      .then((json: { data?: unknown }) => {
        if (!active) return;
        const value = normalizeSeo(json.data);
        setSeo(value);
        setLoaded(value);
      })
      .catch(() => active && setLoaded(EMPTY_SEO));
    return () => {
      active = false;
    };
  }, [props.resourceType, props.resourceId]);

  async function save() {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/app/seo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceType: props.resourceType, resourceId: props.resourceId, seo }) });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setNotice({ tone: "error", text: json?.error?.message ?? "Couldn't save" });
    const saved = normalizeSeo(json?.data);
    setSeo(saved);
    setLoaded(saved);
    setNotice({ tone: "success", text: "Search details saved." });
  }

  if (!loaded) return <div className="flex items-center justify-center gap-2 rounded-[22px] border border-app-line bg-white px-6 py-12 text-[14px] text-app-ink-soft" role="status"><Spinner /> Loading</div>;
  const dirty = JSON.stringify(seo) !== JSON.stringify(loaded);
  return (
    <div className="grid gap-4">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <SeoTab value={seo} onChange={setSeo} title={props.title} fallbackDescription={props.fallbackDescription} slug={props.slug} urlPrefix={props.urlPrefix} siteName={props.siteName} fallbackImage={props.fallbackImage} />
      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-2 rounded-full bg-white/90 p-2 backdrop-blur">
        {dirty && <span className="mr-auto pl-3 text-[13.5px] text-app-ink-soft">Unsaved changes</span>}
        <PillButton tone="ink" size="md" busy={busy} disabled={!dirty} onClick={() => void save()}>Save SEO</PillButton>
      </div>
    </div>
  );
}
