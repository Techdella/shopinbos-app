"use client";

import { useState } from "react";
import { Icon, Badge, MascotAvatar } from "@/components/ui";
import Image from "next/image";

const SIZES = [
  { id: "1024x1024", label: "Square (1:1)" },
  { id: "1792x1024", label: "Landscape (16:9)" },
  { id: "1024x1792", label: "Portrait (9:16)" },
] as const;

const STYLES = [
  { id: "vivid", label: "Vivid" },
  { id: "natural", label: "Natural" },
] as const;

const QUICK_PROMPTS = [
  "Professional product photo of [item] on white background, studio lighting",
  "Lifestyle shot of [item] being used in a modern home setting, warm lighting",
  "Banner for online store sale: bold typography, discount offer, vibrant colors",
  "Social media post template with [item], clean design, brand colors teal and gold",
  "Hero image for ecommerce website: [item] displayed elegantly, premium feel",
];

export function ImageGenClient({ storeName }: { storeName: string }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1792x1024" | "1024x1792">("1024x1024");
  const [style, setStyle] = useState<"vivid" | "natural">("vivid");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<{ url: string; style: string; size: string } | null>(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<number | null>(null);

  const generateImage = async (customPrompt?: string) => {
    const p = customPrompt || prompt;
    if (!p.trim()) return;
    setLoading(true);
    setError("");
    setImage(null);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p.trim(), size, style }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to generate image");
        return;
      }
      setImage(data.image);
      setCredits(data.creditsRemaining ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: "var(--ink-900)" }}>Describe your image</div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="label">Prompt</label>
            <textarea className="ta" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create, e.g. 'A professional product photo of handmade beaded earrings on a marble surface, natural lighting'"
            />
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Size</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SIZES.map((s) => (
                  <button key={s.id} onClick={() => setSize(s.id as any)}
                    style={{
                      padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      background: size === s.id ? "var(--teal-600)" : "var(--ink-50)",
                      color: size === s.id ? "white" : "var(--ink-700)",
                      border: size === s.id ? "1px solid var(--teal-600)" : "1px solid var(--ink-150)",
                    }}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ flexShrink: 0 }}>
              <label className="label">Style</label>
              <div style={{ display: "flex", gap: 6 }}>
                {STYLES.map((s) => (
                  <button key={s.id} onClick={() => setStyle(s.id)}
                    style={{
                      padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      background: style === s.id ? "var(--teal-600)" : "var(--ink-50)",
                      color: style === s.id ? "white" : "var(--ink-700)",
                      border: style === s.id ? "1px solid var(--teal-600)" : "1px solid var(--ink-150)",
                    }}
                  >{s.label}</button>
                ))}
              </div>
            </div>
          </div>
          <button className="dbtn dBtn-mint" onClick={() => generateImage()} disabled={loading || !prompt.trim()} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? <><Icon name="automation" size={14} /> Generating...</> : <><Icon name="sparkle" size={14} /> Generate image</>}
          </button>
          {credits !== null && (
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8, textAlign: "center" }}>
              {credits} AI credits remaining
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--ink-800)" }}>Quick prompts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {QUICK_PROMPTS.map((qp, i) => (
              <button key={i} onClick={() => { setPrompt(qp); }}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 8, fontSize: 12,
                  background: "var(--ink-50)", border: "1px solid var(--ink-100)",
                  cursor: "pointer", color: "var(--ink-700)", fontFamily: "inherit", lineHeight: 1.4,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--teal-50)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "var(--ink-50)"}
              >{qp}</button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <MascotAvatar role="supplier" size={36} />
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
              <strong>Rex's tip:</strong> For best results, describe the subject, setting, lighting, and mood. Reference your brand colors for consistent visuals.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!image && !loading && (
          <div className="card" style={{ padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--teal-100)", display: "grid", placeItems: "center", color: "var(--teal-600)" }}>
              <Icon name="image" size={28} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-600)" }}>Your image will appear here</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-400)", maxWidth: 280 }}>Describe what you want and generate an AI-powered image with DALL-E.</div>
          </div>
        )}

        {loading && (
          <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--teal-200)", borderTopColor: "var(--teal-600)", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-700)" }}>Rex is creating your image...</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>Using DALL-E AI to generate your visual</div>
          </div>
        )}

        {image && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: image.size === "1792x1024" ? "16/9" : image.size === "1024x1792" ? "9/16" : "1/1", borderRadius: 10, overflow: "hidden" }}>
              <Image src={image.url} alt="Generated" fill style={{ objectFit: "contain" }} unoptimized />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <Badge variant="mint">{image.style}</Badge>
                <Badge variant="soft">{image.size}</Badge>
              </div>
              <button className="dbtn dBtn-ghost dBtn-sm" onClick={() => {
                const a = document.createElement("a");
                a.href = image.url;
                a.download = `shopinbos-${Date.now()}.jpg`;
                a.click();
              }}>
                <Icon name="download" size={12} /> Download
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="card" style={{ padding: 14, background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
            <div style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
