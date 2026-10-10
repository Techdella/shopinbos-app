"use client";

import { useState } from "react";
import { Icon, Badge, MascotAvatar } from "@/components/ui";

interface LogoResult {
  style: string;
  label: string;
  url: string;
  palette: { primary: string; secondary: string; accent: string };
}

export function LogoStudioClient({ storeName }: { storeName: string }) {
  const [businessName, setBusinessName] = useState(storeName);
  const [description, setDescription] = useState("");
  const [paletteHint, setPaletteHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [logos, setLogos] = useState<LogoResult[]>([]);
  const [error, setError] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  const generateLogos = async () => {
    if (!businessName.trim()) return;
    setLoading(true);
    setError("");
    setLogos([]);
    try {
      const res = await fetch("/api/ai/generate-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessDescription: description.trim(),
          paletteHint: paletteHint.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to generate logos");
        return;
      }
      setLogos(data.logos ?? []);
      setCredits(data.creditsRemaining ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (url: string) => {
    setSelectedStyle(url);
    try {
      await fetch("/api/store/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: url }),
      });
    } catch {
      // silent
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: "var(--ink-900)" }}>Brand details</div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="label">Business name</label>
            <input className="inp" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your store name" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="label">Describe your business</label>
            <textarea className="ta" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. African fashion boutique selling Ankara dresses and accessories" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="label">Color hint (optional)</label>
            <input className="inp" value={paletteHint} onChange={(e) => setPaletteHint(e.target.value)} placeholder="e.g. teal and gold, warm earth tones" />
          </div>
          <button className="dbtn dBtn-mint" onClick={generateLogos} disabled={loading || !businessName.trim()} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? <><Icon name="automation" size={14} /> Generating...</> : <><Icon name="sparkle" size={14} /> Generate logos</>}
          </button>
          {credits !== null && (
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8, textAlign: "center" }}>
              {credits} AI credits remaining
            </div>
          )}
        </div>

        {error && (
          <div className="card" style={{ padding: 14, background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
            <div style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>
          </div>
        )}

        <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <MascotAvatar role="supplier" size={36} />
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
              <strong>Rex's tip:</strong> Describe your brand style in detail — the more specific you are, the better the logos will match your vision.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {logos.length === 0 && !loading && (
          <div className="card" style={{ padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--teal-100)", display: "grid", placeItems: "center", color: "var(--teal-600)" }}>
              <Icon name="image" size={28} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-600)" }}>Your logos will appear here</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-400)", maxWidth: 280 }}>Fill in your brand details and click generate to create AI-powered logos.</div>
          </div>
        )}

        {loading && (
          <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--teal-200)", borderTopColor: "var(--teal-600)", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-700)" }}>Rex is creating your logos...</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>Generating 3 variations with DALL-E AI</div>
          </div>
        )}

        {logos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-600)", marginBottom: 4 }}>Select your preferred logo</div>
            {logos.map((logo) => (
              <div key={logo.style} className="card" style={{
                padding: 16, cursor: "pointer",
                border: selectedStyle === logo.url ? "2px solid var(--teal-600)" : "1px solid var(--ink-100)",
                transition: "border 0.12s",
              }} onClick={() => handleSelect(logo.url)}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 10, overflow: "hidden",
                    background: logo.palette.accent, flexShrink: 0,
                    display: "grid", placeItems: "center",
                  }}>
                    <img src={logo.url} alt={logo.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)", marginBottom: 2 }}>{logo.label}</div>
                    <Badge variant="mint">{logo.style}</Badge>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[logo.palette.primary, logo.palette.secondary, logo.palette.accent].map((c, i) => (
                        <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: "1px solid var(--ink-150)" }} title={c} />
                      ))}
                    </div>
                  </div>
                  {selectedStyle === logo.url && (
                    <Badge variant="success">Selected</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
