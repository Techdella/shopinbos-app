import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getSellerWorkspace } from "@/lib/workspace";
import { setOnboardingPath } from "@/app/actions/onboarding";

export const dynamic = "force-dynamic";

export default async function PathPickerPage() {
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { onboardingState: true, firstDashboardVisitComplete: true },
  });
  if (store?.firstDashboardVisitComplete) {
    redirect("/home");
  }
  const completedStates = ["SKIPPED", "INCOMPLETE", "LIVE"];
  if (store?.onboardingState && completedStates.includes(store.onboardingState)) {
    redirect("/home");
  }

  const workspace = await getSellerWorkspace(user.id);
  const firstName = user.name?.split(" ")[0] ?? "there";
  const storeName = workspace?.store?.name ?? "";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#FAF7F1" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 60px", borderBottom: "1px solid #E7E0D6", background: "#FAF7F1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/brand/logos/shopinbos-logo-dark.png" alt="Shopinbos" style={{ height: 28, width: "auto" }} />
        </div>

        <div style={{ display: "flex", gap: 28, alignItems: "center", fontSize: 13 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#1A1A18", fontWeight: 600 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#0FA493", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>1</span>
            Pick your path
          </div>
          {[["Set up", false], ["Products", false], ["Launch", false]].map(([label, _active]) => (
            <div key={label as string} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#9CA3AF" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#E7E0D6", color: "#9CA3AF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{["Set up", "Products", "Launch"].indexOf(label as string) + 2}</span>
              {label as string}
            </div>
          ))}
        </div>

        <form action={setOnboardingPath} style={{ all: "initial", display: "contents" }}>
          <input type="hidden" name="path" value="skip" />
          <button type="submit" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: "1px solid #D1CCC3", background: "transparent", color: "#6F6A63", textDecoration: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Skip setup →
          </button>
        </form>
      </header>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "60px 40px" }}>
        <div style={{ maxWidth: 1100, width: "100%", textAlign: "center" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#0FA493", display: "inline-block", marginBottom: 14 }}>
            Welcome{storeName ? `, ${firstName}` : `, ${firstName}`}
          </span>

          <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1.02, margin: "0 0 12px", color: "#1A1A18" }}>
            How do you want to{" "}
            <em style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontStyle: "italic", fontWeight: 500, color: "#0FA493" }}>
              build your store
            </em>
            ?
          </h1>

          <p style={{ fontSize: 17, color: "#6F6A63", marginBottom: 56, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
            Choose one — you can always change your mind later.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
            {/* Build with Rex */}
            <form action={setOnboardingPath} style={{ all: "initial", display: "contents" }}>
              <input type="hidden" name="path" value="rex" />
              <button type="submit" style={{ background: "#1A1A18", border: "1px solid #1A1A18", borderRadius: 24, padding: 0, textAlign: "left", cursor: "pointer", color: "#F9F6F1", textDecoration: "none", display: "flex", flexDirection: "column", overflow: "hidden", width: "100%", fontFamily: "inherit", fontSize: "inherit" }}>
                <div style={{ position: "relative", width: "100%", height: 200, overflow: "hidden", background: "linear-gradient(135deg, #1A1A18 0%, #2A2A28 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src="/brand/mascots/rex-1.png" alt="Rex AI" style={{ height: "100%", width: "100%", objectFit: "cover", opacity: 0.9 }} />
                  <span style={{ position: "absolute", top: 16, right: 16, background: "#E86A4F", color: "white", padding: "4px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                    Fastest
                  </span>
                </div>
                <div style={{ padding: "24px 28px 28px" }}>
                  <h3 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-.02em", color: "#F9F6F1" }}>
                    Build with Rex
                  </h3>
                  <p style={{ fontSize: 14, color: "#A2A29E", lineHeight: 1.55, margin: "0 0 24px" }}>
                    Have a 5-minute chat. Rex picks the layout, writes the copy, names your collections, and shows it live as you go.
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                    {["~5 min", "AI-guided", "Live preview"].map((tag) => (
                      <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "rgba(255,255,255,.08)", color: "#F9F6F1" }}>{tag}</span>
                    ))}
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, color: "#0FA493" }}>
                    Start chatting with Rex →
                  </span>
                </div>
              </button>
            </form>

            {/* Choose a template */}
            <form action={setOnboardingPath} style={{ all: "initial", display: "contents" }}>
              <input type="hidden" name="path" value="template" />
              <button type="submit" style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: 24, padding: "32px 28px 28px", textAlign: "left", cursor: "pointer", color: "#1A1A18", textDecoration: "none", display: "block", width: "100%", fontFamily: "inherit", fontSize: "inherit" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "#F2F5F3", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22, fontSize: 26, color: "#1A1A18" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </div>

                <h3 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-.02em", color: "#1A1A18" }}>
                  Choose a template
                </h3>
                <p style={{ fontSize: 14, color: "#6F6A63", lineHeight: 1.55, margin: "0 0 24px" }}>
                  Browse 30+ professionally designed templates. Pick one that fits your vibe and customize it in the editor.
                </p>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                  {["~10 min", "30+ designs", "Fully editable"].map((tag) => (
                    <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#F2F5F3", color: "#6F6A63" }}>{tag}</span>
                  ))}
                </div>

                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, color: "#0FA493" }}>
                  Browse templates →
                </span>
              </button>
            </form>

            {/* Start from blank */}
            <form action={setOnboardingPath} style={{ all: "initial", display: "contents" }}>
              <input type="hidden" name="path" value="skip" />
              <button type="submit" style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: 24, padding: "32px 28px 28px", textAlign: "left", cursor: "pointer", color: "#1A1A18", textDecoration: "none", display: "block", width: "100%", fontFamily: "inherit", fontSize: "inherit" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "#F2F5F3", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                </div>

                <h3 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-.02em", color: "#1A1A18" }}>
                  Start from blank
                </h3>
                <p style={{ fontSize: 14, color: "#6F6A63", lineHeight: 1.55, margin: "0 0 24px" }}>
                  For pros. Open a blank canvas in the editor and build your store section by section, exactly your way.
                </p>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                  {["Open-ended", "Full control", "Drag & drop"].map((tag) => (
                    <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#F2F5F3", color: "#6F6A63" }}>{tag}</span>
                  ))}
                </div>

                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, color: "#0FA493" }}>
                  Open the editor →
                </span>
              </button>
            </form>
          </div>

          <div style={{ marginTop: 32, fontSize: 13, color: "#6F6A63" }}>
            Not ready to build?{" "}
            <form action={setOnboardingPath} style={{ all: "initial", display: "inline" }}>
              <input type="hidden" name="path" value="skip" />
              <button type="submit" style={{ color: "#0FA493", fontWeight: 600, textDecoration: "none", cursor: "pointer", border: "none", background: "none", padding: 0, fontFamily: "inherit", fontSize: 13, display: "inline" }}>
                Just take me to my dashboard →
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
