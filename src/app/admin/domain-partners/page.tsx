"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon } from "@/components/ui/Icon";

interface DomainPartner {
  id: string;
  name: string;
  baseUrl: string;
  affiliateUrl: string | null;
  logoUrl: string | null;
  description: string;
  featured: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  baseUrl: string;
  affiliateUrl: string;
  description: string;
  featured: boolean;
  sortOrder: number;
  active: boolean;
}

const empty: FormState = {
  name: "",
  baseUrl: "",
  affiliateUrl: "",
  description: "",
  featured: false,
  sortOrder: 0,
  active: true,
};

export default function AdminDomainPartnersPage() {
  const [partners, setPartners] = useState<DomainPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/domain-partners");
      const json = await res.json() as { data?: DomainPartner[] };
      setPartners(json.data ?? []);
    } catch {
      setError("Failed to load domain partners.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(empty);
    setShowForm(true);
  }

  function openEdit(p: DomainPartner) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      baseUrl: p.baseUrl,
      affiliateUrl: p.affiliateUrl ?? "",
      description: p.description,
      featured: p.featured,
      sortOrder: p.sortOrder,
      active: p.active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      flash("Name and Base URL are required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        affiliateUrl: form.affiliateUrl.trim() || null,
        description: form.description.trim(),
        featured: form.featured,
        sortOrder: form.sortOrder,
        active: form.active,
      };
      const res = editingId
        ? await fetch(`/api/admin/domain-partners/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/admin/domain-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Save failed.");
      setShowForm(false);
      setEditingId(null);
      flash(editingId ? "Partner updated." : "Partner added.");
      await load();
    } catch {
      flash("Error saving partner.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the domain partners list?`)) return;
    try {
      await fetch(`/api/admin/domain-partners/${id}`, { method: "DELETE" });
      flash("Partner removed.");
      await load();
    } catch {
      flash("Error deleting partner.");
    }
  }

  async function toggleActive(p: DomainPartner) {
    try {
      await fetch(`/api/admin/domain-partners/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      await load();
    } catch {
      flash("Error updating partner.");
    }
  }

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--ink-200, #e0dfdb)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-600, #4e4e4a)",
    marginBottom: 4,
  };

  return (
    <AppFrame role="admin">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ink-400)" }}>
              Admin
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: "var(--ink-900)" }}>
              Domain Partners
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
              Manage domain registrar affiliate links shown to sellers on the Domain settings page.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 999,
              background: "var(--mint, #73D8C8)",
              color: "var(--navy, #0e2a38)",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="plus" size={14} /> Add partner
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#991b1b" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--ink-400)", fontSize: 13 }}>Loading…</div>
        ) : partners.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              borderRadius: 12,
              border: "1px solid var(--ink-100, #ece9e2)",
              background: "white",
            }}
          >
            <Icon name="globe" size={32} style={{ color: "var(--ink-300)", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-800)" }}>No domain partners yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6 }}>
              Add registrars with affiliate links to show sellers where to buy domains.
            </div>
            <button
              type="button"
              onClick={openCreate}
              style={{ marginTop: 16, padding: "8px 16px", borderRadius: 999, background: "var(--mint)", color: "var(--navy)", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer" }}
            >
              Add first partner
            </button>
          </div>
        ) : (
          <div style={{ borderRadius: 12, border: "1px solid var(--ink-100, #ece9e2)", overflow: "hidden", background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ink-100)", background: "var(--ink-50, #f7f5f2)" }}>
                  {["Name", "Base URL", "Affiliate URL", "Status", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-500)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--ink-50)", opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700, color: "var(--ink-900)" }}>{p.name}</div>
                      {p.featured && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "var(--mint)", color: "var(--navy)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Featured
                        </span>
                      )}
                      {p.description && (
                        <div style={{ fontSize: 11.5, color: "var(--ink-400)", marginTop: 2 }}>{p.description}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <a href={p.baseUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal-700)", fontSize: 12 }}>
                        {p.baseUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {p.affiliateUrl ? (
                        <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal-700)", fontSize: 12 }}>
                          {p.affiliateUrl.replace(/^https?:\/\//, "").slice(0, 40)}{p.affiliateUrl.length > 50 ? "…" : ""}
                        </a>
                      ) : (
                        <span style={{ color: "var(--ink-300)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        type="button"
                        onClick={() => void toggleActive(p)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          border: "none",
                          cursor: "pointer",
                          background: p.active ? "var(--teal-100, #d1fae5)" : "var(--ink-100)",
                          color: p.active ? "var(--teal-700)" : "var(--ink-500)",
                        }}
                      >
                        {p.active ? "Active" : "Hidden"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--ink-200)", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--ink-700)" }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(p.id, p.name)}
                          style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#991b1b" }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Slide-in form */}
        {showForm && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(14,42,56,0.6)",
              zIndex: 9000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 16,
                padding: 28,
                maxWidth: 520,
                width: "100%",
                boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                  {editingId ? "Edit partner" : "Add domain partner"}
                </h2>
                <button type="button" onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--ink-400)" }}>
                  ×
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={label}>Registrar name *</label>
                  <input style={inp} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Namecheap" />
                </div>
                <div>
                  <label style={label}>Base URL *</label>
                  <input style={inp} value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://namecheap.com" type="url" />
                </div>
                <div>
                  <label style={label}>Affiliate URL</label>
                  <input style={inp} value={form.affiliateUrl} onChange={(e) => setForm((f) => ({ ...f, affiliateUrl: e.target.value }))} placeholder="https://namecheap.com?aff=YOUR_ID" type="url" />
                  <div style={{ fontSize: 11.5, color: "var(--ink-400)", marginTop: 4 }}>Leave blank to use Base URL without affiliate tracking.</div>
                </div>
                <div>
                  <label style={label}>Short description</label>
                  <input style={inp} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Popular choice with competitive prices" />
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Sort order</label>
                    <input
                      style={{ ...inp, width: "100%" }}
                      value={form.sortOrder}
                      type="number"
                      min={0}
                      onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ ...label, margin: 0 }}>Options</label>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} />
                        Featured
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                        Active
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{ padding: "9px 18px", borderRadius: 999, background: "white", border: "1px solid var(--ink-200)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={{ padding: "9px 18px", borderRadius: 999, background: "var(--mint)", color: "var(--navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add partner"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#0D1B35",
              color: "white",
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              zIndex: 9999,
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              pointerEvents: "none",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
