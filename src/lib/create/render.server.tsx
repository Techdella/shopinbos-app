import "server-only";

import { randomUUID } from "node:crypto";
import { ImageResponse } from "next/og";
import { appOrigin } from "@/lib/ads";
import { safeFetch } from "@/lib/security/safe-fetch.server";
import { uploadPublicFileAt } from "@/lib/supabase/storage.server";
import { recordMedia } from "@/lib/media/library.server";
import { textOn, type DesignSpec } from "@shared/create-with-rex";

// Create with Rex designs: templated pictures drawn on the server with next/og (Satori), from the person's photo,
// the idea's headline and line, their name and brand colours. No image model is involved, so nothing invented
// ends up on a product picture. Each design is stored in the public media bucket (social/create/<userId>/…) and
// noted in the person's media library as an AI creation.

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export interface DesignContent {
  headline: string;
  subline: string;
  brand: string;
  /** Shown on flyers' footer ("adashairlounge.mybos.store"). */
  link: string | null;
  palette: { hero: string; accent: string; paper: string; ink: string };
}

type Sharp = (typeof import("sharp"))["default"];
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/**
 * A photo as a data URL the renderer can draw (JPEG, at most 1400px), or null. Our own uploads are fetched from the
 * app; anything else only from public http(s) hosts (checked after DNS and on every redirect).
 */
export async function loadPhoto(source: string | null | undefined): Promise<string | null> {
  if (!source) return null;
  const own = source.startsWith("/") && !source.startsWith("//");
  if (!own && !/^https?:\/\//i.test(source)) return null;
  try {
    const signal = AbortSignal.timeout(15_000);
    const response = own ? await fetch(`${appOrigin()}${source}`, { signal }) : await safeFetch(source, { signal });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return null;
    const sharp = await loadSharp();
    if (!sharp) return /image\/(jpeg|png)/.test(type) ? `data:${type.split(";")[0]};base64,${bytes.toString("base64")}` : null;
    const jpeg = await sharp(bytes).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (error) {
    console.warn("[create] photo could not be loaded", error instanceof Error ? error.message : error);
    return null;
  }
}

// Space Grotesk (the brand's display face) from Google Fonts, once per server; the renderer's own font otherwise.
let fontPromise: Promise<ArrayBuffer | null> | null = null;
function displayFont() {
  fontPromise ??= (async () => {
    try {
      const css = await fetch("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700", { signal: AbortSignal.timeout(5_000) }).then((r) => (r.ok ? r.text() : ""));
      const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
      if (!url) return null;
      const font = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return font.ok ? await font.arrayBuffer() : null;
    } catch {
      return null;
    }
  })();
  return fontPromise.then((font) => {
    if (!font) fontPromise = null; // try again next time
    return font;
  });
}

function headlineSize(spec: DesignSpec, text: string) {
  const base = spec.width * (text.length <= 14 ? 0.15 : text.length <= 24 ? 0.115 : text.length <= 36 ? 0.09 : 0.072);
  return Math.round(spec.height <= spec.width ? base * 0.8 : spec.height < spec.width * 1.5 ? base * 0.9 : base);
}

function PlayMark({ colour }: { colour: string }) {
  return (
    <div style={{ display: "flex", width: 170, height: 170, borderRadius: 999, background: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }}>
      <svg width="96" height="96" viewBox="0 0 24 24" style={{ marginLeft: 10 }}>
        <path d="M7 4.5v15l12.5-7.5z" fill={colour} />
      </svg>
    </div>
  );
}

function Pill({ text, bg, fg, size }: { text: string; bg: string; fg: string; size: number }) {
  return <div style={{ display: "flex", alignSelf: "flex-start", background: bg, color: fg, fontSize: size, padding: `${Math.round(size * 0.45)}px ${Math.round(size * 0.9)}px`, borderRadius: 999 }}>{text}</div>;
}

function Footer({ content, fg }: { content: DesignContent; fg: string }) {
  return (
    <div style={{ display: "flex", alignSelf: "stretch", justifyContent: "space-between", alignItems: "center", gap: 24, fontSize: 34, color: fg, opacity: 0.9 }}>
      <div style={{ display: "flex" }}>{content.brand}</div>
      {content.link ? <div style={{ display: "flex" }}>{content.link}</div> : null}
    </div>
  );
}

function Design({ spec, content, photo }: { spec: DesignSpec; content: DesignContent; photo: string | null }) {
  const { hero, accent, paper, ink } = content.palette;
  const size = headlineSize(spec, content.headline);
  const pad = Math.round(spec.width * 0.075);
  const tall = spec.height > spec.width * 1.5;
  const sub = Math.round(spec.width * (tall ? 0.052 : 0.042));
  const label = tall ? 42 : 32;

  if (spec.style === "photo" && photo) {
    return (
      <div style={{ display: "flex", position: "relative", width: spec.width, height: spec.height, background: hero }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" width={spec.width} height={spec.height} style={{ position: "absolute", top: 0, left: 0, width: spec.width, height: spec.height, objectFit: "cover" }} />
        <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round(spec.height * 0.6), backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.78))" }} />
        {spec.playMark ? <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: spec.width, height: spec.height, alignItems: "center", justifyContent: "center" }}><PlayMark colour={hero} /></div> : null}
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: pad, right: pad, bottom: pad, gap: 28 }}>
          <Pill text={content.brand} bg={accent} fg={textOn(accent)} size={tall ? 38 : 30} />
          <div style={{ display: "flex", color: "#FFFFFF", fontSize: size, lineHeight: 1.02, letterSpacing: -2 }}>{content.headline}</div>
          {content.subline ? <div style={{ display: "flex", color: "#FFFFFF", fontSize: sub, opacity: 0.92 }}>{content.subline}</div> : null}
          {spec.footer ? <Footer content={content} fg="#FFFFFF" /> : null}
        </div>
      </div>
    );
  }

  if (spec.style === "card") {
    const photoBox = Math.round(Math.min(spec.width - pad * 2, spec.height * 0.5));
    return (
      <div style={{ display: "flex", flexDirection: "column", width: spec.width, height: spec.height, background: paper, padding: pad, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", color: ink, fontSize: label, opacity: 0.7 }}>{content.brand}</div>
          <div style={{ display: "flex", color: ink, fontSize: Math.round(size * 0.9), lineHeight: 1.02, letterSpacing: -2 }}>{content.headline}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={photoBox} height={photoBox} style={{ width: photoBox, height: photoBox, objectFit: "cover", borderRadius: 48 }} />
          ) : (
            <div style={{ display: "flex", width: photoBox, height: Math.round(photoBox * 0.6), borderRadius: 48, background: hero, color: textOn(hero), alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.6), padding: 40, textAlign: "center" }}>{content.brand}</div>
          )}
          {spec.playMark && photo ? <div style={{ display: "flex", position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}><PlayMark colour={hero} /></div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {content.subline ? <Pill text={content.subline} bg={accent} fg={textOn(accent)} size={sub} /> : null}
          {spec.footer ? <Footer content={content} fg={ink} /> : null}
        </div>
      </div>
    );
  }

  // "block": a colour block with the words, the photo under it. Without a photo, the second block uses the accent.
  const inverted = !photo && spec.n === 3;
  const bg = inverted ? accent : hero;
  const fg = textOn(bg);
  const blockHeight = photo ? Math.round(spec.height * (spec.height > spec.width ? 0.44 : 0.5)) : spec.height;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: spec.width, height: spec.height, background: bg }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: photo ? "flex-end" : "center", height: blockHeight, padding: pad, gap: 26 }}>
        <div style={{ display: "flex", color: fg, fontSize: label, opacity: 0.8 }}>{content.brand}</div>
        <div style={{ display: "flex", color: fg, fontSize: size, lineHeight: 1.02, letterSpacing: -2 }}>{content.headline}</div>
        {content.subline ? <Pill text={content.subline} bg={inverted ? hero : accent} fg={textOn(inverted ? hero : accent)} size={sub} /> : null}
        {!photo && spec.playMark ? <div style={{ display: "flex", marginTop: 40 }}><PlayMark colour={bg} /></div> : null}
        {!photo && spec.footer ? <div style={{ display: "flex", marginTop: 40 }}><Footer content={content} fg={fg} /></div> : null}
      </div>
      {photo ? (
        <div style={{ display: "flex", position: "relative", flexGrow: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" width={spec.width} height={spec.height - blockHeight} style={{ width: spec.width, height: spec.height - blockHeight, objectFit: "cover" }} />
          {spec.playMark ? <div style={{ display: "flex", position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}><PlayMark colour={hero} /></div> : null}
          {spec.footer ? <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, padding: `24px ${pad}px`, background: hero }}><Footer content={content} fg={textOn(hero)} /></div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Draws one design and returns it as JPEG (PNG if sharp can't load). */
export async function renderDesign(spec: DesignSpec, content: DesignContent, photo: string | null): Promise<{ bytes: Buffer; type: "image/jpeg" | "image/png" }> {
  const font = await displayFont();
  const response = new ImageResponse(<Design spec={spec} content={content} photo={photo} />, {
    width: spec.width,
    height: spec.height,
    ...(font ? { fonts: [{ name: "Space Grotesk", data: font, weight: 700 as const, style: "normal" as const }] } : {}),
  });
  const png = Buffer.from(await response.arrayBuffer());
  if (!png.byteLength) throw new Error("The design came out empty");
  const sharp = await loadSharp();
  if (!sharp) return { bytes: png, type: "image/png" };
  return { bytes: await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer(), type: "image/jpeg" };
}

/** Stores a design in the public media bucket and the person's media library; returns its public URL. */
export async function storeDesign(input: { userId: string; jobId: string; n: number; bytes: Buffer; type: "image/jpeg" | "image/png"; width: number; height: number; name: string }) {
  const ext = input.type === "image/png" ? "png" : "jpg";
  const path = `social/create/${input.userId}/${input.jobId}-${input.n}-${randomUUID().replace(/-/g, "").slice(0, 12)}.${ext}`;
  const stored = await uploadPublicFileAt(path, new Blob([new Uint8Array(input.bytes)], { type: input.type }));
  await recordMedia({ userId: input.userId, url: stored.publicUrl, path: stored.path, name: input.name, kind: "image", width: input.width, height: input.height, bytes: input.bytes.byteLength, source: "ai" });
  return stored.publicUrl;
}
