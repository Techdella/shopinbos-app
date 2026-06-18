"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

type SupplierData = {
  displayName: string;
  city?: string;
  country?: string;
  verificationStatus: string;
  trustScore?: number;
};

type UserData = {
  name: string;
  email: string;
  avatarUrl?: string;
};

export const dynamic = "force-dynamic";

export default function SupplierVerificationPage() {
  const [supplier, setSupplier] = useState<SupplierData | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/supplier/me")
      .then((r) => {
        if (!r.ok) throw new Error("Unable to load supplier verification.");
        return r.json();
      })
      .then((d) => {
        const payload = d.data ?? d;
        if (!payload.supplier || !payload.user) {
          throw new Error("Supplier verification details were not returned.");
        }
        if (payload.supplier) setSupplier(payload.supplier);
        if (payload.user) setUser(payload.user);
      })
      .catch((err: Error) => setError(err.message || "Unable to load supplier verification."));
  }, []);

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--danger)" }}>
        {error}
      </div>
    );
  }

  if (!supplier || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--ink-400)" }}>
        Loading...
      </div>
    );
  }

  const isVerified = supplier.verificationStatus === "verified";
  const docs = [
    { n: "Business Name registration or CAC certificate", t: "BN or RC document accepted", required: true },
    { n: "Owner NIN", t: "NIN slip or NIN-backed identity document", required: true },
    { n: "Factory or product warehouse photo", t: "Factory, workshop, or product warehouse evidence", required: true },
    { n: "Tax Identification Number (TIN)", t: "FIRS - optional but boosts trust score", required: false },
    { n: "Product quality samples / catalogue", t: "Process documentation - optional", required: false },
    { n: "Insurance certificate", t: "Public liability - unlocks Wholesale-ready badge", required: false },
  ];

  return (
    <AppFrame
      role="supplier"
      storeName={supplier.displayName}
      storeSlug={`${supplier.city ?? "Aba"} - ${supplier.country ?? "Nigeria"}`}
      storeInitial={supplier.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Verification status"
          sub={`${supplier.displayName} - ${isVerified ? "verified" : supplier.verificationStatus ?? "unverified"}${isVerified ? " - approved Mar 18, 2025" : ""}`}
          actions={<button className="dbtn dBtn-ghost"><Icon name="upload" size={14} /> Update documents</button>}
        />

        {isVerified ? (
          <div className="card" style={{ padding: 24, background: "linear-gradient(135deg, #d1fae5, #b9e9d4)", border: "none" }}>
            <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
              <div style={{
                width: 62, height: 62, borderRadius: 18, background: "var(--success)",
                color: "white", display: "grid", placeItems: "center", flexShrink: 0,
              }}>
                <Icon name="check" size={32} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-accent)", fontSize: 26, fontWeight: 400, lineHeight: 1.1, color: "var(--success)" }}>
                  Verified supplier
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink-700)", marginTop: 5 }}>
                  Approved by Shopinbos admin - Trust score <strong>{supplier.trustScore ?? 94}/100</strong> - Public verification badge active
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Annual renewal</div>
                <div style={{ fontFamily: "var(--font-accent)", fontSize: 18, fontWeight: 500 }}>Mar 18, 2027</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 24, background: "linear-gradient(135deg, var(--amber-50), #fdecd4)", border: "1px solid var(--amber-200)" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{
                width: 50, height: 50, borderRadius: 14, background: "var(--amber-100)",
                color: "var(--amber-700)", display: "grid", placeItems: "center", flexShrink: 0,
              }}>
                <Icon name="clock" size={24} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-accent)", fontSize: 22, fontWeight: 400, color: "var(--amber-700)" }}>
                  Verification pending
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-600)", marginTop: 3 }}>
                  Upload your documents below to get verified. Verified suppliers get a public badge and higher search ranking.
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Documents required</div>

            {docs.map((d, i) => {
              const status = isVerified ? "approved" : "missing";
              return (
                <div key={d.n} style={{
                  padding: "13px 0", borderTop: i ? "1px solid var(--ink-100)" : "none",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10, background: "var(--ink-50)",
                    color: status === "approved" ? "var(--success)" : "var(--warning)",
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    {status === "approved" ? <Icon name="check" size={20} /> : <Icon name="upload" size={18} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.n}</div>
                      {!d.required && <Badge variant="soft" style={{ fontSize: 10 }}>Optional</Badge>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{d.t}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>
                      {status === "approved" ? "Approved by admin" : d.required ? "Upload required" : "Optional - improves trust score"}
                    </div>
                  </div>
                  {status === "approved" ? (
                    <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "6px 11px" }}>View</button>
                  ) : (
                    <button className="dbtn dBtn-soft" style={{ fontSize: 12, padding: "6px 11px" }}>Upload</button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Trust score breakdown</div>
              {[
                { l: "Verification completeness", v: isVerified ? 100 : 35, c: "var(--success)" },
                { l: "Order fulfillment (1y)", v: 96, c: "var(--success)" },
                { l: "Quality (reviews)", v: 96, c: "var(--success)" },
                { l: "Response time", v: 91, c: "var(--success)" },
                { l: "Stock accuracy", v: 89, c: "var(--warning)" },
                { l: "Dispute rate (inverse)", v: 98, c: "var(--success)" },
              ].map((r, i) => (
                <div key={r.l} style={{ padding: "7px 0", borderTop: i ? "1px solid var(--ink-100)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "var(--ink-600)" }}>{r.l}</span>
                    <strong style={{ color: r.c }}>{r.v}</strong>
                  </div>
                  <div style={{ height: 4, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${r.v}%`, height: "100%", background: r.c }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--amber-50), #fdecd4)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--paper)", color: "#b97511", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon name="bolt" size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#b97511", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                    Boost your score
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
                    Add an <strong>insurance certificate</strong> to unlock the "Wholesale-ready" badge. Sellers placing orders over NGN 500K filter by this.
                  </div>
                  <button className="dbtn" style={{
                    marginTop: 7, padding: "4px 9px", fontSize: 11,
                    background: "var(--ink-900)", color: "white", border: "none",
                  }}>
                    Upload certificate
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
