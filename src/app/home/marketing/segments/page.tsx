"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: "manual" | "auto";
  rules: string | null;
  subscriberCount: number;
}

function SegmentCard({ segment, onEdit, onDelete }: {
  segment: Segment;
  onEdit: (s: Segment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>{segment.name}</div>
        <Badge variant={segment.type === "auto" ? "mint" : "soft"}>{segment.type}</Badge>
      </div>
      {segment.description && (
        <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.4 }}>{segment.description}</div>
      )}
      <div style={{ fontSize: 12, color: "var(--ink-600)", fontWeight: 600 }}>
        {segment.subscriberCount} subscriber{segment.subscriberCount !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        <button onClick={() => onEdit(segment)}
          className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        <button onClick={() => onDelete(segment.id)}
          className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--danger)" }}>Delete</button>
      </div>
    </div>
  );
}

export default function SegmentsPage() {
  const { toast } = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", type: "manual" as "manual" | "auto", rules: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/segments");
      const data = await res.json();
      if (Array.isArray(data.data)) setSegments(data.data);
    } catch {
      toast("Could not load segments", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchSegments(); }, [fetchSegments]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ name: "", description: "", type: "manual", rules: "" });
    setShowForm(true);
  }, []);

  const openEdit = useCallback((s: Segment) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description || "",
      type: s.type,
      rules: s.rules || "",
    });
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let rules = null;
      if (form.type === "auto" && form.rules) {
        try { rules = JSON.parse(form.rules); } catch { rules = form.rules; }
      }
      const body = { name: form.name, description: form.description, type: form.type, rules };
      const url = editing ? `/api/store/segments/${editing.id}` : "/api/store/segments";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast(editing ? "Segment updated" : "Segment created", "success");
        setShowForm(false);
        void fetchSegments();
      }
    } catch {
      toast("Failed to save segment", "error");
    } finally {
      setSaving(false);
    }
  }, [form, editing, toast, fetchSegments]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this segment?")) return;
    try {
      const res = await fetch(`/api/store/segments/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Segment deleted", "success");
        void fetchSegments();
      }
    } catch {
      toast("Failed to delete segment", "error");
    }
  }, [toast, fetchSegments]);

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Customer Segments"
          sub="Group customers by behaviour, value, or custom rules"
          actions={
            <button onClick={openCreate}
              className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="plus" size={14} /> Create Segment
            </button>
          }
        />

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", color: "var(--ink-500)" }}>
            <Icon name="layers" size={32} color="var(--ink-300)" />
            <div style={{ marginTop: 8, fontWeight: 600 }}>No segments yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Create segments to target specific groups of customers.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {segments.map((s) => (
              <SegmentCard key={s.id} segment={s} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {showForm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "grid", placeItems: "center" }}
            onClick={() => setShowForm(false)}>
            <div className="card" style={{ padding: 24, maxWidth: 500, width: "90%", maxHeight: "80vh", overflow: "auto" }}
              onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--ink-900)" }}>
                {editing ? "Edit Segment" : "Create Segment"}
              </h3>
              <form onSubmit={(e) => void handleSave(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label className="label">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="inp" required />
                </div>
                <div className="field">
                  <label className="label">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="ta" rows={2} />
                </div>
                <div className="field">
                  <label className="label">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "manual" | "auto" })}
                    className="sel">
                    <option value="manual">Manual</option>
                    <option value="auto">Automatic (rules-based)</option>
                  </select>
                </div>
                {form.type === "auto" && (
                  <div className="field">
                    <label className="label">Rules (JSON)</label>
                    <textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })}
                      className="ta" rows={4}
                      placeholder={JSON.stringify({ minOrders: 3, minSpent: 10000, period: "all" }, null, 2)} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button type="submit" disabled={saving}
                    className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    {saving ? "Saving..." : (editing ? "Update" : "Create")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
