"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  source: string;
  status: string;
  tags: string[];
  lastOpenedAt: string | null;
  createdAt: string;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { dateStyle: "medium" });
}

const STATUS_OPTIONS = ["All", "Active", "Unsubscribed", "Bounced"];
const SOURCE_OPTIONS = ["All", "checkout", "form", "import", "manual", "api"];

export default function SubscribersPage() {
  const { toast } = useToast();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showEdit, setShowEdit] = useState<Subscriber | null>(null);
  const [editForm, setEditForm] = useState({ name: "", tags: "" });
  const [importCsv, setImportCsv] = useState("");
  const [importSource, setImportSource] = useState("manual");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter !== "All") params.set("status", statusFilter.toLowerCase());
      if (sourceFilter !== "All") params.set("source", sourceFilter);
      const res = await fetch(`/api/store/subscribers?${params}`);
      const data = await res.json();
      if (Array.isArray(data.data)) setSubscribers(data.data);
      if (data.pagination?.totalPages) setTotalPages(data.pagination.totalPages);
      else if (data.pagination?.total) setTotalPages(Math.ceil(data.pagination.total / 20));
    } catch {
      toast("Could not load subscribers", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sourceFilter, toast]);

  useEffect(() => { void fetchSubscribers(); }, [fetchSubscribers]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) setSelected(new Set(subscribers.map((s) => s.id)));
    else setSelected(new Set());
  }, [subscribers]);

  const handleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkUnsubscribe = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const res = await fetch("/api/store/subscribers/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action: "unsubscribe" }),
      });
      if (res.ok) {
        toast(`${selected.size} subscriber(s) unsubscribed`, "success");
        setSelected(new Set());
        void fetchSubscribers();
      }
    } catch {
      toast("Bulk unsubscribe failed", "error");
    }
  }, [selected, toast, fetchSubscribers]);

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} subscriber(s)?`)) return;
    try {
      const res = await fetch("/api/store/subscribers/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (res.ok) {
        toast(`${selected.size} subscriber(s) deleted`, "success");
        setSelected(new Set());
        void fetchSubscribers();
      }
    } catch {
      toast("Bulk delete failed", "error");
    }
  }, [selected, toast, fetchSubscribers]);

  const handleUnsubscribe = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/store/subscribers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "unsubscribed" }),
      });
      if (res.ok) {
        toast("Subscriber unsubscribed", "success");
        void fetchSubscribers();
      }
    } catch {
      toast("Failed to unsubscribe", "error");
    }
  }, [toast, fetchSubscribers]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this subscriber?")) return;
    try {
      const res = await fetch(`/api/store/subscribers/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Subscriber deleted", "success");
        void fetchSubscribers();
      }
    } catch {
      toast("Failed to delete", "error");
    }
  }, [toast, fetchSubscribers]);

  const handleEditSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEdit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/store/subscribers/${showEdit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          tags: editForm.tags ? editForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      if (res.ok) {
        toast("Subscriber updated", "success");
        setShowEdit(null);
        void fetchSubscribers();
      }
    } catch {
      toast("Failed to update subscriber", "error");
    } finally {
      setSaving(false);
    }
  }, [showEdit, editForm, toast, fetchSubscribers]);

  const handleImport = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/store/subscribers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: importCsv.split("\n").map((l) => l.trim()).filter(Boolean), source: importSource }),
      });
      if (res.ok) {
        toast("Import completed", "success");
        setShowImport(false);
        setImportCsv("");
        void fetchSubscribers();
      }
    } catch {
      toast("Import failed", "error");
    } finally {
      setSaving(false);
    }
  }, [importCsv, importSource, toast, fetchSubscribers]);

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportCsv(text);
  }, []);

  const stats = {
    total: subscribers.length,
    active: subscribers.filter((s) => s.status === "active").length,
    newThisMonth: subscribers.filter((s) => {
      const d = new Date(s.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    unsubscribed: subscribers.filter((s) => s.status === "unsubscribed").length,
  };

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Subscribers"
          sub="Your email audience"
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <RexAICopywriter />
              <button onClick={() => setShowImport(true)}
                className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="upload" size={14} /> Import CSV
              </button>
            </div>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Total Subscribers", value: String(stats.total), color: "var(--teal-600)" },
            { label: "Active", value: String(stats.active), color: "var(--success)" },
            { label: "New This Month", value: String(stats.newThisMonth), color: "var(--berry-500)" },
            { label: "Unsubscribes", value: String(stats.unsubscribed), color: "var(--coral-500)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: "var(--ink-900)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="inp" placeholder="Search by email or name..." style={{ flex: 1, minWidth: 200, fontSize: 13 }} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="sel" style={{ fontSize: 13 }}>
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
            className="sel" style={{ fontSize: 13 }}>
            {SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o === "All" ? "All Sources" : o}</option>)}
          </select>
          {selected.size > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-500)", alignSelf: "center" }}>{selected.size} selected</span>
              <button onClick={handleBulkUnsubscribe} className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Unsubscribe</button>
              <button onClick={handleBulkDelete} className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--danger)" }}>Delete</button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading subscribers...</div>
        ) : subscribers.length === 0 ? (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", color: "var(--ink-500)" }}>
            <Icon name="users" size={32} color="var(--ink-300)" />
            <div style={{ marginTop: 8, fontWeight: 600 }}>No subscribers yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Import a CSV or add subscribers through forms and checkout.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" onChange={(e) => handleSelectAll(e.target.checked)}
                      checked={selected.size === subscribers.length && subscribers.length > 0}
                      style={{ accentColor: "var(--teal-600)" }} />
                  </th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Tags</th>
                  <th>Last Opened</th>
                  <th>Subscribed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => handleSelect(s.id)}
                        style={{ accentColor: "var(--teal-600)" }} />
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.email}</td>
                    <td style={{ fontSize: 12.5, color: "var(--ink-600)" }}>{s.name || "—"}</td>
                    <td><Badge variant="soft">{s.source}</Badge></td>
                    <td>
                      <Badge variant={s.status === "active" ? "success" : s.status === "unsubscribed" ? "warn" : "soft"}>{s.status}</Badge>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {s.tags?.length > 0 ? s.tags.slice(0, 2).join(", ") + (s.tags.length > 2 ? ` +${s.tags.length - 2}` : "") : "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(s.lastOpenedAt)}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(s.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => { setShowEdit(s); setEditForm({ name: s.name || "", tags: s.tags?.join(", ") || "" }); }}
                          className="dbtn dBtn-ghost dBtn-xs" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                        <button onClick={() => void handleUnsubscribe(s.id)}
                          className="dbtn dBtn-ghost dBtn-xs" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Unsub</button>
                        <button onClick={() => void handleDelete(s.id)}
                          className="dbtn dBtn-ghost dBtn-xs" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--danger)" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Prev</button>
            <span style={{ fontSize: 12, color: "var(--ink-500)" }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Next</button>
          </div>
        )}
      </div>

      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "grid", placeItems: "center" }}
          onClick={() => setShowImport(false)}>
          <div className="card" style={{ padding: 24, maxWidth: 500, width: "90%", maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--ink-900)" }}>Import Subscribers</h3>
            <form onSubmit={(e) => void handleImport(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  <Icon name="upload" size={14} /> Upload CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={(e) => void handleFileImport(e)}
                  style={{ display: "none" }} />
              </div>
              <div className="field">
                <label className="label">Or paste emails (one per line)</label>
                <textarea value={importCsv} onChange={(e) => setImportCsv(e.target.value)}
                  className="ta" rows={6} placeholder={"john@example.com\njane@example.com"} />
              </div>
              <div className="field">
                <label className="label">Source</label>
                <select value={importSource} onChange={(e) => setImportSource(e.target.value)} className="sel">
                  <option value="manual">Manual</option>
                  <option value="import">Import</option>
                  <option value="form">Form</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" onClick={() => setShowImport(false)}
                  className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button type="submit" disabled={saving || !importCsv.trim()}
                  className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {saving ? "Importing..." : "Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "grid", placeItems: "center" }}
          onClick={() => setShowEdit(null)}>
          <div className="card" style={{ padding: 24, maxWidth: 440, width: "90%" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--ink-900)" }}>Edit Subscriber</h3>
            <form onSubmit={(e) => void handleEditSave(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label className="label">Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="inp" />
              </div>
              <div className="field">
                <label className="label">Tags (comma-separated)</label>
                <input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  className="inp" placeholder="vip, repeat, newsletter" />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" onClick={() => setShowEdit(null)}
                  className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button type="submit" disabled={saving}
                  className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
