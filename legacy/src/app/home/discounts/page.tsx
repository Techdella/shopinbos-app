"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";

interface Discount {
  id: string;
  name: string;
  code: string;
  type: string;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  status: string;
}

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  status: string;
}

export default function SellerDiscountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get("tab") ?? "Discounts";
  const action = searchParams?.get("action");

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", code: "", type: "percentage", value: "",
    minOrder: "", maxUses: "", expiresAt: "",
  });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (action === "new") setShowForm(true);
  }, [action]);

  useEffect(() => {
    async function load() {
      try {
        const [discRes, coupRes] = await Promise.all([
          fetch("/api/store/discounts"),
          fetch("/api/store/coupons"),
        ]);
        const discData = await discRes.json();
        const coupData = await coupRes.json();
        if (Array.isArray(discData.data)) setDiscounts(discData.data);
        if (Array.isArray(coupData.data)) setCoupons(coupData.data);
      } catch {
        setNotice("Could not load data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const createDiscount = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/store/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.data) {
        setDiscounts((prev) => [data.data, ...prev]);
        setShowForm(false);
        setForm({ name: "", code: "", type: "percentage", value: "", minOrder: "", maxUses: "", expiresAt: "" });
        setNotice("Discount created!");
      }
    } catch {
      setNotice("Could not create discount");
    }
  }, [form]);

  const generateCoupon = useCallback(async () => {
    try {
      const res = await fetch("/api/store/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", type: "percentage", value: 10 }),
      });
      const data = await res.json();
      if (data.data) {
        setCoupons((prev) => [data.data, ...prev]);
        setNotice(`Coupon generated: ${data.data.code}`);
      }
    } catch {
      setNotice("Could not generate coupon");
    }
  }, []);

  const toggleStatus = useCallback(async (d: Discount) => {
    const newStatus = d.status === "active" ? "disabled" : "active";
    try {
      const res = await fetch("/api/store/discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, status: newStatus }),
      });
      const data = await res.json();
      if (data.data) {
        setDiscounts((prev) => prev.map((p) => p.id === d.id ? data.data : p));
      }
    } catch {
      setNotice("Could not update status");
    }
  }, []);

  const formatValue = (d: { type: string; value: number }) => {
    switch (d.type) {
      case "percentage": return `${d.value}% off`;
      case "fixed_amount": return `₦${d.value.toLocaleString()} off`;
      case "free_shipping": return "Free delivery";
      case "bogo": return `${d.value}% off 2nd item`;
      default: return `${d.value}`;
    }
  };

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Discounts & coupons"
          sub="Create and manage promotions, coupon codes, and sales events"
          actions={
            <button onClick={() => setShowForm(!showForm)}
              className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="plus" size={14} /> Create offer
            </button>
          }
        />

        {notice && (
          <div style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, background: "var(--mint-bg)", color: "var(--mint)", border: "1px solid var(--mint-border)" }}>
            {notice}
            <button onClick={() => setNotice("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>✕</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={(e) => void createDiscount(e)} className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>New discount offer</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="inp" style={{ fontSize: 13 }} required />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Code
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="inp" style={{ fontSize: 13, fontFamily: "var(--font-mono)" }} required />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="sel" style={{ fontSize: 13 }}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed amount</option>
                  <option value="free_shipping">Free shipping</option>
                  <option value="bogo">BOGO</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Value
                <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
                  type="number" className="inp" style={{ fontSize: 13 }} required />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Min. order (₦)
                <input value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
                  type="number" className="inp" style={{ fontSize: 13 }} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Max uses
                <input value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  type="number" className="inp" style={{ fontSize: 13 }} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-sec)" }}>
                Expires
                <input value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  type="date" className="inp" style={{ fontSize: 13 }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" onClick={() => setShowForm(false)}
                className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button type="submit"
                className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Create</button>
            </div>
          </form>
        )}

        <div className="design-tabs">
          {["Discounts", "Coupon Codes", "Sales Events"].map((t) => (
            <Link key={t} href={`/home/discounts?tab=${encodeURIComponent(t)}`}
              className={`tab${t === activeTab ? " on" : ""}`}
              style={{ textDecoration: "none" }}>{t}</Link>
          ))}
        </div>

        {activeTab === "Discounts" && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading...</div>
            ) : discounts.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>
                No discounts yet. Create your first offer above.
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Value</th>
                    <th>Min. order</th>
                    <th>Uses</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12 }}>{d.code}</td>
                      <td style={{ fontWeight: 600 }}>{formatValue(d)}</td>
                      <td style={{ fontSize: 12.5 }}>{d.minOrder ? `₦${d.minOrder.toLocaleString()}` : "—"}</td>
                      <td style={{ fontSize: 12.5 }}>{d.maxUses ? `${d.usedCount} / ${d.maxUses}` : `${d.usedCount}`}</td>
                      <td style={{ fontSize: 12.5 }}>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</td>
                      <td>
                        <button onClick={() => void toggleStatus(d)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                          <Badge variant={d.status === "active" ? "success" : d.status === "scheduled" ? "warn" : "soft"}>{d.status}</Badge>
                        </button>
                      </td>
                      <td>
                        <button onClick={() => void toggleStatus(d)}
                          className="dbtn dBtn-ghost dBtn-sm"
                          style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                          <Icon name={d.status === "active" ? "pause" : "play"} size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "Coupon Codes" && (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => void generateCoupon()}
                className="dbtn dBtn-mint"
                style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="plus" size={14} /> Generate coupon
              </button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading...</div>
              ) : coupons.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>
                  No coupon codes yet. Generate one above.
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Discount</th>
                      <th>Min. order</th>
                      <th>Used</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12.5, color: "var(--mint)" }}>{c.code}</td>
                        <td style={{ fontWeight: 600 }}>{formatValue(c)}</td>
                        <td style={{ fontSize: 12.5 }}>{c.minOrder ? `₦${c.minOrder.toLocaleString()}` : "—"}</td>
                        <td style={{ fontSize: 12.5 }}>{c.usedCount} / {c.maxUses || "∞"}</td>
                        <td style={{ fontSize: 12.5 }}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</td>
                        <td><Badge variant={c.status === "active" ? "success" : "soft"}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === "Sales Events" && (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--text-sec)" }}>
              No sales events scheduled. Create a time-limited sale to boost conversions.
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, background: "var(--mint-bg)", border: "1px solid var(--mint-border)" }}>
          <MascotAvatar role="seller" size={40} />
          <div style={{ flex: 1, fontSize: 13, color: "var(--mint-deep)", lineHeight: 1.5 }}>
            <strong>Peggy's tip:</strong> Time-limited discounts create urgency. Try a 24-hour flash sale with a unique coupon code to see what resonates with your customers.
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
