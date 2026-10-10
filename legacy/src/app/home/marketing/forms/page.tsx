"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
}

interface FormPopupSettings {
  timing: "immediate" | "delay" | "exit_intent";
  delaySeconds?: number;
  pages: "all" | "home" | "product";
  frequency: "once" | "session" | "always";
  devices: ("mobile" | "desktop")[];
  afterSubmit: "message" | "add_subscriber" | "notify" | "redirect";
  redirectUrl?: string;
  message?: string;
}

interface Form {
  id: string;
  name: string;
  type: "inline" | "popup";
  active: boolean;
  fields: FormField[];
  popupSettings: FormPopupSettings | null;
  createdAt: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Radio" },
  { value: "textarea", label: "Textarea" },
];

const TAB_OPTIONS = ["All Forms", "Popups"];

function emptyPopupSettings(): FormPopupSettings {
  return {
    timing: "immediate",
    delaySeconds: 5,
    pages: "all",
    frequency: "once",
    devices: ["mobile", "desktop"],
    afterSubmit: "add_subscriber",
  };
}

export default function FormsPage() {
  const { toast } = useToast();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All Forms");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Form | null>(null);
  const [form, setForm] = useState({
    name: "", type: "inline" as "inline" | "popup",
    fields: [] as FormField[],
    popupSettings: null as FormPopupSettings | null,
  });
  const [saving, setSaving] = useState(false);

  const fetchForms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/forms");
      const data = await res.json();
      if (Array.isArray(data.data)) setForms(data.data);
    } catch {
      toast("Could not load forms", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchForms(); }, [fetchForms]);

  const openCreate = useCallback((type: "inline" | "popup") => {
    setEditing(null);
    setForm({
      name: "",
      type,
      fields: [],
      popupSettings: type === "popup" ? emptyPopupSettings() : null,
    });
    setShowForm(true);
  }, []);

  const openEdit = useCallback((f: Form) => {
    setEditing(f);
    setForm({
      name: f.name,
      type: f.type,
      fields: f.fields || [],
      popupSettings: f.popupSettings || (f.type === "popup" ? emptyPopupSettings() : null),
    });
    setShowForm(true);
  }, []);

  const addField = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      fields: [...prev.fields, { id: Math.random().toString(36).slice(2), type: "text", label: "", required: false }],
    }));
  }, []);

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }, []);

  const removeField = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.id !== id) }));
  }, []);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ps = form.type === "popup" ? form.popupSettings : null;
      const body = {
        name: form.name,
        type: form.type === "popup" ? "popup" : form.type,
        isPopup: form.type === "popup",
        fields: form.fields.filter((f) => f.label.trim()),
        popupConfig: ps ? { timing: ps.timing, delaySeconds: ps.delaySeconds, pages: ps.pages, frequency: ps.frequency, devices: ps.devices, afterSubmit: ps.afterSubmit, redirectUrl: ps.redirectUrl, message: ps.message } : {},
        actions: ps ? [{ type: ps.afterSubmit === "add_subscriber" ? "add_subscriber" : ps.afterSubmit === "notify" ? "notify_seller" : ps.afterSubmit === "redirect" ? "redirect" : "show_message", config: { message: ps.message, redirectUrl: ps.redirectUrl } }] : [],
      };
      const url = editing ? `/api/store/forms/${editing.id}` : "/api/store/forms";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast(editing ? "Form updated" : "Form created", "success");
        setShowForm(false);
        void fetchForms();
      }
    } catch {
      toast("Failed to save form", "error");
    } finally {
      setSaving(false);
    }
  }, [form, editing, toast, fetchForms]);

  const handleToggle = useCallback(async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/store/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        toast(`Form ${active ? "activated" : "deactivated"}`, "success");
        void fetchForms();
      }
    } catch {
      toast("Failed to update form", "error");
    }
  }, [toast, fetchForms]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this form?")) return;
    try {
      const res = await fetch(`/api/store/forms/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Form deleted", "success");
        void fetchForms();
      }
    } catch {
      toast("Failed to delete form", "error");
    }
  }, [toast, fetchForms]);

  const filtered = forms.filter((f) => {
    if (activeTab === "All Forms") return true;
    if (activeTab === "Popups") return f.type === "popup";
    return true;
  });

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Forms & Popups"
          sub="Create and manage forms and popup widgets"
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openCreate("inline")}
                className="dbtn dBtn-ghost" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="plus" size={14} /> Inline Form
              </button>
              <button onClick={() => openCreate("popup")}
                className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="plus" size={14} /> Popup
              </button>
            </div>
          }
        />

        <div className="design-tabs">
          {TAB_OPTIONS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`tab${tab === activeTab ? " on" : ""}`}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading forms...</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", color: "var(--ink-500)" }}>
            <Icon name="file" size={32} color="var(--ink-300)" />
            <div style={{ marginTop: 8, fontWeight: 600 }}>No forms yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Create a form or popup to capture leads and grow your list.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {filtered.map((f) => (
              <div key={f.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>{f.name}</div>
                  <Badge variant={f.type === "popup" ? "mint" : "soft"}>{f.type}</Badge>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--ink-500)" }}>
                  <span>{f.fields?.length || 0} field{(f.fields?.length || 0) !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>Created {new Date(f.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => handleToggle(f.id, !f.active)}
                    className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    <Badge variant={f.active ? "success" : "soft"}>{f.active ? "Active" : "Inactive"}</Badge>
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                  <button onClick={() => openEdit(f)}
                    className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                  <button onClick={() => void handleDelete(f.id)}
                    className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--danger)" }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "grid", placeItems: "center" }}
            onClick={() => setShowForm(false)}>
            <div className="card" style={{ padding: 24, maxWidth: 560, width: "90%", maxHeight: "85vh", overflow: "auto" }}
              onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "var(--ink-900)" }}>
                {editing ? "Edit Form" : `Create ${form.type === "popup" ? "Popup" : "Form"}`}
              </h3>
              <form onSubmit={(e) => void handleSave(e)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label className="label">Form name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="inp" required />
                </div>

                <div className="field">
                  <label className="label">Type</label>
                  <select value={form.type} onChange={(e) => {
                    const t = e.target.value as "inline" | "popup";
                    setForm({ ...form, type: t, popupSettings: t === "popup" ? emptyPopupSettings() : null });
                  }} className="sel">
                    <option value="inline">Inline Form</option>
                    <option value="popup">Popup</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <label className="label" style={{ margin: 0 }}>Fields</label>
                    <button type="button" onClick={addField}
                      className="dbtn dBtn-ghost dBtn-sm" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      <Icon name="plus" size={12} /> Add Field
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {form.fields.map((field) => (
                      <div key={field.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select value={field.type} onChange={(e) => updateField(field.id, { type: e.target.value })}
                          className="sel" style={{ width: 100, fontSize: 12 }}>
                          {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                        </select>
                        <input value={field.label} onChange={(e) => updateField(field.id, { label: e.target.value })}
                          className="inp" placeholder="Field label" style={{ flex: 1, fontSize: 12 }} />
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, whiteSpace: "nowrap", cursor: "pointer" }}>
                          <input type="checkbox" checked={field.required}
                            onChange={(e) => updateField(field.id, { required: e.target.checked })}
                            style={{ accentColor: "var(--teal-600)" }} />
                          Required
                        </label>
                        <button type="button" onClick={() => removeField(field.id)}
                          className="dbtn dBtn-ghost dBtn-xs" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--danger)" }}>
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    ))}
                    {form.fields.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--ink-400)", padding: "8px 0" }}>No fields added yet.</div>
                    )}
                  </div>
                </div>

                {form.type === "popup" && form.popupSettings && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "var(--ink-50)", borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)" }}>Popup Settings</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div className="field">
                        <label className="label">Timing</label>
                        <select value={form.popupSettings.timing}
                          onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, timing: e.target.value as any } })}
                          className="sel">
                          <option value="immediate">Immediate</option>
                          <option value="delay">Delay (seconds)</option>
                          <option value="exit_intent">Exit Intent</option>
                        </select>
                      </div>
                      {form.popupSettings.timing === "delay" && (
                        <div className="field">
                          <label className="label">Delay (seconds)</label>
                          <input type="number" value={form.popupSettings.delaySeconds || 5}
                            onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, delaySeconds: Number(e.target.value) } })}
                            className="inp" min={1} max={60} />
                        </div>
                      )}
                      <div className="field">
                        <label className="label">Pages</label>
                        <select value={form.popupSettings.pages}
                          onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, pages: e.target.value as any } })}
                          className="sel">
                          <option value="all">All Pages</option>
                          <option value="home">Home Page Only</option>
                          <option value="product">Product Pages</option>
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">Frequency</label>
                        <select value={form.popupSettings.frequency}
                          onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, frequency: e.target.value as any } })}
                          className="sel">
                          <option value="once">Once</option>
                          <option value="session">Per Session</option>
                          <option value="always">Always</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Show on devices</label>
                      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                        {["mobile", "desktop"].map((d) => (
                          <label key={d} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                            <input type="checkbox" checked={form.popupSettings!.devices.includes(d as any)}
                              onChange={() => {
                                const devs = form.popupSettings!.devices.includes(d as any)
                                  ? form.popupSettings!.devices.filter((x) => x !== d)
                                  : [...form.popupSettings!.devices, d as any];
                                setForm({ ...form, popupSettings: { ...form.popupSettings!, devices: devs } });
                              }}
                              style={{ accentColor: "var(--teal-600)" }} />
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label className="label">After submission</label>
                      <select value={form.popupSettings.afterSubmit}
                        onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, afterSubmit: e.target.value as any } })}
                        className="sel">
                        <option value="add_subscriber">Add subscriber</option>
                        <option value="message">Show message</option>
                        <option value="notify">Notify seller</option>
                        <option value="redirect">Redirect to URL</option>
                      </select>
                    </div>
                    {form.popupSettings.afterSubmit === "message" && (
                      <div className="field">
                        <label className="label">Success message</label>
                        <input value={form.popupSettings.message || ""}
                          onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, message: e.target.value } })}
                          className="inp" placeholder="Thanks for subscribing!" />
                      </div>
                    )}
                    {form.popupSettings.afterSubmit === "redirect" && (
                      <div className="field">
                        <label className="label">Redirect URL</label>
                        <input value={form.popupSettings.redirectUrl || ""}
                          onChange={(e) => setForm({ ...form, popupSettings: { ...form.popupSettings!, redirectUrl: e.target.value } })}
                          className="inp" placeholder="https://..." />
                      </div>
                    )}
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
