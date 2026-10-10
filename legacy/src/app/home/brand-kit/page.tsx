import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, MascotAvatar } from "@/components/ui";

export const dynamic = "force-dynamic";

const logos = [
  { bg: "#F2C8B4", color: "#3a2614", label: "Wordmark · primary", txt: "sahel sole", fontSize: 24, weight: 600, italic: true, font: "serif" },
  { bg: "#195754", color: "#F2C8B4", label: "Wordmark · dark", txt: "sahel sole", fontSize: 24, weight: 600, italic: true, font: "serif" },
  { bg: "#FFFCF7", color: "#3a2614", label: "Monogram", txt: "S.", fontSize: 40, weight: 500, italic: false, font: "serif" },
  { bg: "#3a2614", color: "#F2C8B4", label: "Reverse", txt: "sahel sole", fontSize: 24, weight: 600, italic: true, font: "serif" },
];

const palette = [
  { c: "#D4A574", l: "Primary · Sahel tan" },
  { c: "#6B4A2C", l: "Ink · Bauchi" },
  { c: "#F2C8B4", l: "Surface · Sand" },
  { c: "#195754", l: "Accent · Indigo" },
  { c: "#E86A4F", l: "Highlight · Sokoto" },
];

const tones = ["Warm", "Direct", "Luxurious", "Playful", "Heritage"];
const formality = ["Casual", "Mid", "Formal"];
const emoji = ["None", "Sparse", "Plenty"];

export default async function BrandKitPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const initials = user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={initials}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          crumbs={["Store", "Brand kit"]}
          title="Brand kit"
          sub="Logo, palette, typography, voice. Changes apply across storefront, invoices, and emails."
          actions={
            <>
              <button className="btn btn-ghost"><Icon name="refresh" size={14}/> Re-roll with Rex</button>
              <button className="btn btn-mint">Save</button>
            </>
          }
        />

        <div className="tabs">
          <div className="t on">Visual identity</div>
          <div className="t">Voice & tone</div>
          <div className="t">Logo variants</div>
          <div className="t">Brand assets</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 380px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Logo */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Logo</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {logos.map((l, i) => (
                  <div key={i}>
                    <div style={{
                      aspectRatio: "1/1", borderRadius: 12, background: l.bg, color: l.color,
                      display: "grid", placeItems: "center", border: "1px solid var(--ink-100)",
                      fontFamily: l.font, fontSize: l.fontSize, fontWeight: l.weight,
                      fontStyle: l.italic ? "italic" : "normal",
                    }}>
                      {l.txt}
                    </div>
                    <div style={{
                      fontSize: 11, color: "var(--ink-600)",
                      textAlign: "center", marginTop: 5,
                    }}>{l.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm"><Icon name="upload" size={12}/> Upload custom</button>
                <button className="btn btn-soft btn-sm"><Icon name="sparkle" size={12}/> Rex · generate new</button>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}><Icon name="download" size={12}/> Download pack</button>
              </div>
            </div>

            {/* Palette */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Palette · 5 colors</div>
                <button className="btn btn-soft btn-sm"><Icon name="refresh" size={12}/> Re-roll palette</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                {palette.map((s, i) => (
                  <div key={i} className="card" style={{
                    padding: 0, overflow: "hidden", boxShadow: "none",
                  }}>
                    <div style={{ aspectRatio: "1/1", background: s.c }}/>
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{s.l}</div>
                      <div style={{
                        fontSize: 10, color: "var(--ink-500)",
                        fontFamily: "var(--f-mono)", marginTop: 2,
                      }}>{s.c}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                display: "flex", gap: 8, marginTop: 14,
                padding: "10px 12px", background: "var(--success-bg)", color: "var(--success)",
                borderRadius: 8, fontSize: 12, fontWeight: 600,
              }}>
                <Icon name="check" size={13}/> WCAG AA contrast passes across all combinations
              </div>
            </div>

            {/* Typography */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Typography pairing</div>
                <button className="btn btn-soft btn-sm">Browse pairings</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="card" style={{ padding: 18, borderColor: "var(--teal-300)" }}>
                  <div style={{
                    fontSize: 11, color: "var(--teal-700)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
                  }}>Headings · Space Grotesk</div>
                  <div style={{
                    fontFamily: "var(--f-display)", fontSize: 34, lineHeight: 1.05,
                    marginBottom: 6, fontWeight: 500, letterSpacing: "-0.01em",
                  }}>Hand-stitched.</div>
                  <div style={{
                    fontFamily: "var(--f-accent)", fontSize: 18, fontStyle: "italic",
                    color: "var(--ink-600)",
                  }}>Made to walk.</div>
                  <hr className="hr"/>
                  <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Weights: 400 · 500 · 600 italic</div>
                </div>
                <div className="card" style={{ padding: 18, borderColor: "var(--teal-300)" }}>
                  <div style={{
                    fontSize: 11, color: "var(--teal-700)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
                  }}>Body · Inter</div>
                  <div style={{
                    fontFamily: "var(--f-body)", fontSize: 14, lineHeight: 1.55,
                    color: "var(--ink-800)",
                  }}>
                    From locally tanned hides, each pair takes three days in our Kano workshop. Walk dusty streets and clean offices alike.
                  </div>
                  <hr className="hr"/>
                  <div style={{ fontSize: 11, color: "var(--ink-500)" }}>Weights: 400 · 500 · 600 · 700</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12.5 }}>
                <div><div style={{ color: "var(--ink-500)", fontSize: 11 }}>Base size</div><strong>16px</strong></div>
                <div><div style={{ color: "var(--ink-500)", fontSize: 11 }}>Scale</div><strong>1.25 · Major third</strong></div>
                <div><div style={{ color: "var(--ink-500)", fontSize: 11 }}>Line height</div><strong>1.55 body · 1.05 display</strong></div>
                <div><div style={{ color: "var(--ink-500)", fontSize: 11 }}>Tracking</div><strong>-0.01em display</strong></div>
              </div>
            </div>

            {/* Voice */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Brand voice</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div className="field">
                  <label className="label">Tone</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {tones.map((t, i) => (
                      <button key={i} className={"chip " + (i === 0 || i === 4 ? "on" : "")} style={{ fontSize: 11.5 }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="label">Formality</label>
                  <div style={{ display: "flex", gap: 5 }}>
                    {formality.map((t, i) => (
                      <button key={i} className={"chip " + (i === 1 ? "on" : "")} style={{ fontSize: 11.5 }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="label">Emoji</label>
                  <div style={{ display: "flex", gap: 5 }}>
                    {emoji.map((t, i) => (
                      <button key={i} className={"chip " + (i === 1 ? "on" : "")} style={{ fontSize: 11.5 }}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="field">
                <label className="label">Voice sample (Peggy uses this when writing)</label>
                <textarea
                  className="ta" rows={3}
                  defaultValue={"Stitched, not glued. Each pair takes three days. If something opens up in the first year, we re-stitch it free. Made in Kano. Made to walk."}
                  style={{ fontSize: 13.5, lineHeight: 1.5 }}
                />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 0, alignSelf: "flex-start" }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 12 }}>Live preview</div>
              <div style={{ display: "grid", placeItems: "center" }}>
                <div style={{ width: 240, height: 420, borderRadius: 20, border: "3px solid var(--ink-300)", overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: 50, background: "var(--primary)", display: "flex",
                    alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <Icon name="store" size={16} color="white"/>
                    <span style={{ fontFamily: "var(--f-display)", color: "white", fontSize: 14, fontWeight: 600 }}>Sahel Sole</span>
                  </div>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ borderRadius: 8, background: "var(--ink-50)", height: 100 }} />
                    <div style={{ borderRadius: 8, background: "var(--ink-50)", height: 14, width: "70%" }} />
                    <div style={{ borderRadius: 8, background: "var(--ink-50)", height: 10, width: "50%" }} />
                    <div style={{ borderRadius: 8, background: "var(--ink-50)", height: 10, width: "80%" }} />
                    <div style={{
                      borderRadius: 8, background: "var(--primary)", height: 36, marginTop: 6,
                      display: "grid", placeItems: "center", color: "white",
                      fontSize: 12, fontWeight: 600,
                    }}>
                      Shop now
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{
              padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <MascotAvatar role="supplier" size={38}/>
                <div>
                  <div style={{
                    fontSize: 11, color: "var(--teal-700)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>Rex</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>
                    Don&apos;t love the palette? Type a vibe — <em>&ldquo;earthy and bold&rdquo;</em>, <em>&ldquo;clean monochrome&rdquo;</em>, <em>&ldquo;sunset&rdquo;</em> — and I&apos;ll roll again.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
