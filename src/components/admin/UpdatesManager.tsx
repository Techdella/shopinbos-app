"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useMemo, useRef, useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui";
import { SLIDE_CSS, UpdateSlide, type SlideUpdate } from "@/components/updates/UpdateSlide";
import { UpdatesViewer, type ViewerUpdate } from "@/components/updates/UpdatesViewer";
import { parseVideoLink, type VideoSource } from "@shared/help-videos";
import {
  EXPIRY_CHOICES,
  MOTION_STYLES,
  UPDATE_BODY_MAX,
  UPDATE_IMAGE_TYPES,
  UPDATE_KINDS,
  UPDATE_ROLES,
  UPDATE_THEMES,
  UPDATE_TITLE_MAX,
  UPDATE_VIDEO_TYPES,
  isOwnUpdateFile,
  nextMondayMorning,
  safeCtaUrl,
  updateStatus,
  updateUploadProblem,
  type UpdateKind,
  type UpdateRole,
} from "@shared/weekly-updates";
import { TIPS } from "@/lib/member-messaging/tips-library";
import { friendlyError } from "@/lib/errors/report-client";

// /admin/updates: the weekly updates sellers, suppliers and delivery partners tap through from the ring in the top
// bar. Write a text or motion card, upload a picture or a video (the browser sends it straight to Storage with a
// one-time signed URL; the server then checks the bytes) or paste a YouTube/Vimeo link, pick who sees it and when,
// and publish. A live preview shows the card as people will see it.

export interface UpdateAdminRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  theme: string;
  motion: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  roles: string[];
  published: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "scheduled" | "live" | "ended";
  views: number;
}

interface Draft {
  id: string | null;
  kind: UpdateKind;
  title: string;
  body: string;
  theme: string;
  motion: string;
  mediaUrl: string;
  posterUrl: string;
  durationSeconds: string;
  ctaLabel: string;
  ctaUrl: string;
  roles: UpdateRole[];
  published: boolean;
  publishAt: string; // datetime-local
  expiresAt: string; // datetime-local, "" = no end
}

const ROLE_LABEL: Record<string, string> = Object.fromEntries(UPDATE_ROLES.map((role) => [role.value, role.label]));
const KIND_LABEL: Record<string, string> = Object.fromEntries(UPDATE_KINDS.map((kind) => [kind.value, kind.label]));
const STATUS_PILL = {
  live: <Pill tone="success" dot>Live</Pill>,
  scheduled: <Pill tone="info">Scheduled</Pill>,
  draft: <Pill tone="muted">Draft</Pill>,
  ended: <Pill tone="warning">Ended</Pill>,
} as const;

/** "2026-10-26T08:00" in the admin's own time zone, for a datetime-local input. */
function toLocalInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addDays(local: string, days: number) {
  const base = local ? new Date(local) : new Date();
  base.setDate(base.getDate() + days);
  return toLocalInput(base);
}

function toDraft(row: UpdateAdminRow): Draft {
  return {
    id: row.id,
    kind: (UPDATE_KINDS.some((kind) => kind.value === row.kind) ? row.kind : "text") as UpdateKind,
    title: row.title,
    body: row.body ?? "",
    theme: row.theme,
    motion: row.motion ?? "rise",
    mediaUrl: row.mediaUrl ?? "",
    posterUrl: row.posterUrl ?? "",
    durationSeconds: row.durationSeconds ? String(row.durationSeconds) : "",
    ctaLabel: row.ctaLabel ?? "",
    ctaUrl: row.ctaUrl ?? "",
    roles: row.roles.filter((role): role is UpdateRole => UPDATE_ROLES.some((item) => item.value === role)),
    published: row.published,
    publishAt: toLocalInput(row.publishAt),
    expiresAt: toLocalInput(row.expiresAt),
  };
}

function blankDraft(): Draft {
  const publishAt = toLocalInput(nextMondayMorning());
  return {
    id: null,
    kind: "motion",
    title: "",
    body: "",
    theme: "navy",
    motion: "rise",
    mediaUrl: "",
    posterUrl: "",
    durationSeconds: "",
    ctaLabel: "",
    ctaUrl: "",
    roles: ["seller", "supplier", "logistics_partner"],
    published: false,
    publishAt,
    expiresAt: addDays(publishAt, 7),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "That didn't work. Try again.");
  return body?.data as T;
}

/** PUT the file to the signed Storage URL, reporting progress (0 to 1). */
function putFile(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "Storage refused a file that big. Export it smaller or paste a YouTube or Vimeo link." : "The upload didn't finish. Try again.")));
    xhr.onerror = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
    xhr.send(file);
  });
}

function fileDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

/** The draft as the viewer would play it (null media when it isn't playable yet). */
function previewOf(draft: Draft, storageBase: string): ViewerUpdate {
  const media = draft.mediaUrl.trim();
  const video: VideoSource | null = draft.kind !== "video" || !media ? null : parseVideoLink(media) ?? (isOwnUpdateFile(media, storageBase) ? { kind: "file", url: media } : null);
  const cta = draft.ctaLabel.trim() && safeCtaUrl(draft.ctaUrl) ? { label: draft.ctaLabel.trim(), url: safeCtaUrl(draft.ctaUrl)! } : null;
  return {
    id: draft.id ?? "preview",
    kind: draft.kind,
    title: draft.title || "Your title",
    body: draft.body || (draft.kind === "text" || draft.kind === "motion" ? "Write the words for the card." : null),
    theme: draft.theme,
    motion: draft.motion,
    imageUrl: draft.kind === "image" && media ? media : null,
    video,
    posterUrl: draft.posterUrl || (video?.kind === "youtube" ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null),
    durationSeconds: draft.durationSeconds ? Number(draft.durationSeconds) : null,
    cta,
    publishedAt: fromLocalInput(draft.publishAt) ?? new Date().toISOString(),
    seen: true,
  };
}

export function UpdatesManager({ initial, storageBase, migrationNeeded }: { initial: UpdateAdminRow[]; storageBase: string; migrationNeeded: boolean }) {
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [playing, setPlaying] = useState<ViewerUpdate[] | null>(null);
  const [filter, setFilter] = useState<"all" | UpdateRole>("all");

  const shown = useMemo(() => rows.filter((row) => filter === "all" || row.roles.includes(filter)), [rows, filter]);
  const live = rows.filter((row) => updateStatus(row) === "live");

  if (migrationNeeded) {
    return <Notice tone="info">Weekly updates need a database update first. Run docs/migrations/2026-11-26-weekly-updates.sql, then reload this page.</Notice>;
  }

  const open = (next: Draft | null) => {
    setDraft(next);
    setError(null);
    setSaved(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const payload = {
        kind: draft.kind,
        title: draft.title,
        body: draft.body.trim() || null,
        theme: draft.theme,
        motion: draft.kind === "motion" ? draft.motion : null,
        mediaUrl: draft.mediaUrl.trim() || null,
        posterUrl: draft.posterUrl.trim() || null,
        durationSeconds: draft.durationSeconds ? Math.round(Number(draft.durationSeconds)) || null : null,
        ctaLabel: draft.ctaLabel.trim() || null,
        ctaUrl: draft.ctaUrl.trim() || null,
        roles: draft.roles,
        published: draft.published,
        publishAt: fromLocalInput(draft.publishAt),
        expiresAt: fromLocalInput(draft.expiresAt),
      };
      const row = await readJson<UpdateAdminRow>(
        await fetch(draft.id ? `/api/admin/updates/${draft.id}` : "/api/admin/updates", {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setRows((current) => (draft.id ? current.map((item) => (item.id === row.id ? row : item)) : [row, ...current]));
      setDraft(toDraft(row));
      setSaved(
        row.status === "live" ? "Saved. It's live: people see it from the ring in their top bar."
          : row.status === "scheduled" ? `Saved. It goes live ${new Date(row.publishAt!).toLocaleString()}.`
          : row.status === "ended" ? "Saved, but its end date has passed, so nobody sees it."
          : "Saved as a draft. Nobody sees it until you publish.",
      );
    } catch (problem) {
      setError(problem instanceof Error ? friendlyError(problem) : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !(await confirmDialog("Delete this update? It disappears for everyone straight away."))) return;
    setSaving(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/admin/updates/${draft.id}`, { method: "DELETE" }));
      setRows((current) => current.filter((row) => row.id !== draft.id));
      setDraft(null);
    } catch (problem) {
      setError(problem instanceof Error ? friendlyError(problem) : "That didn't delete. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,720px)]">
      <style>{SLIDE_CSS}</style>
      <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
        <CardHead
          title="Updates"
          sub={`${live.length} live now. Each one shows from its start date to its end date, in the ring at the top of the app.`}
          action={<PillButton size="sm" tone="ink" onClick={() => open(blankDraft())}><Icon name="plus" size={14} /> New update</PillButton>}
        />
        <div className="flex flex-wrap gap-1.5">
          {([{ value: "all", label: "Everyone" }, ...UPDATE_ROLES] as const).map((item) => (
            <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={cx("min-h-[34px] rounded-full px-3 text-[13px] font-bold", filter === item.value ? "bg-app-ink text-white" : "border border-app-line bg-white")}>
              {item.label}
            </button>
          ))}
          <span className="flex-1" />
          {live.length > 0 && (
            <PillButton size="sm" tone="white" onClick={() => setPlaying(live.filter((row) => filter === "all" || row.roles.includes(filter)).map((row) => previewOf(toDraft(row), storageBase)))}>
              <Icon name="play" size={13} /> Play what&apos;s live
            </PillButton>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="m-0 text-[14px] text-app-ink-soft">No updates yet. Start one, or turn one of the weekly tips into a motion card.</p>
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0">
            {shown.map((row) => {
              const status = updateStatus(row);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    data-update-row={row.id}
                    onClick={() => open(toDraft(row))}
                    className={cx("flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-app-canvas", draft?.id === row.id && "bg-app-canvas")}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px] text-[11px] font-extrabold" style={{ background: UPDATE_THEMES.find((theme) => theme.value === row.theme)?.bg ?? "#0E2A38", color: UPDATE_THEMES.find((theme) => theme.value === row.theme)?.ink ?? "#F4F1EA" }}>
                      {row.kind === "image" && row.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.mediaUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon name={row.kind === "video" ? "play" : row.kind === "motion" ? "sparkle" : "document"} size={17} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{row.title}</span>
                      <span className="block truncate text-[12px] text-app-ink-soft">
                        {KIND_LABEL[row.kind] ?? row.kind} · {row.roles.map((role) => ROLE_LABEL[role] ?? role).join(", ")}
                        {row.publishAt ? ` · ${new Date(row.publishAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                        {` · ${row.views} seen`}
                      </span>
                    </span>
                    {STATUS_PILL[status]}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="min-w-0">
        {draft ? (
          <Editor draft={draft} setDraft={setDraft} storageBase={storageBase} saving={saving} error={error} saved={saved} setError={setError} onSave={() => void save()} onDelete={() => void remove()} onClose={() => open(null)} onPlay={() => setPlaying([previewOf(draft, storageBase)])} />
        ) : (
          <Card className="p-4 sm:p-5">
            <CardHead title="Pick an update to edit" sub="Post a selling tip every week. Text and motion cards are the quickest; add a picture or a short video when you have one. New updates start next Monday at 8am and show for a week." />
          </Card>
        )}
      </div>
      {playing && playing.length > 0 && <UpdatesViewer updates={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  storageBase,
  saving,
  error,
  saved,
  setError,
  onSave,
  onDelete,
  onClose,
  onPlay,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  storageBase: string;
  saving: boolean;
  error: string | null;
  saved: string | null;
  setError: (error: string | null) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  onPlay: () => void;
}) {
  const [videoTab, setVideoTab] = useState<"upload" | "link">(draft.mediaUrl && parseVideoLink(draft.mediaUrl) ? "link" : "upload");
  const [progress, setProgress] = useState<number | null>(null);
  const [imageBusy, setImageBusy] = useState<"media" | "poster" | null>(null);
  const [replay, setReplay] = useState(0);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const preview: SlideUpdate = previewOf(draft, storageBase);
  const link = draft.kind === "video" && draft.mediaUrl.trim() && !isOwnUpdateFile(draft.mediaUrl, storageBase) ? parseVideoLink(draft.mediaUrl) : null;
  const tipsForRoles = TIPS.filter((tip) => draft.roles.includes(tip.role));

  const upload = async (target: "video" | "media" | "poster", file: File | undefined) => {
    if (!file) return;
    setError(null);
    const kind = target === "video" ? "video" : "image";
    const problem = updateUploadProblem(kind, file.type, file.size);
    if (problem) return setError(problem);
    try {
      if (target === "video") setProgress(0);
      else setImageBusy(target);
      const signed = await readJson<{ signedUrl: string; publicUrl: string }>(
        await fetch("/api/admin/updates/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, type: file.type, size: file.size }) }),
      );
      await putFile(signed.signedUrl, file, (fraction) => target === "video" && setProgress(fraction));
      if (target === "video") {
        const seconds = await fileDuration(file);
        setDraft({ ...draft, mediaUrl: signed.publicUrl, durationSeconds: seconds ? String(seconds) : draft.durationSeconds });
      } else if (target === "media") {
        setDraft({ ...draft, mediaUrl: signed.publicUrl });
      } else {
        setDraft({ ...draft, posterUrl: signed.publicUrl });
      }
    } catch (problem) {
      setError(problem instanceof Error ? friendlyError(problem) : "The upload didn't finish. Try again.");
    } finally {
      setProgress(null);
      setImageBusy(null);
    }
  };

  const fromTip = (id: string) => {
    const tip = TIPS.find((item) => item.id === id);
    if (!tip) return;
    set({
      kind: draft.kind === "image" || draft.kind === "video" ? draft.kind : "motion",
      title: tip.title.slice(0, UPDATE_TITLE_MAX),
      body: tip.whatsapp.slice(0, UPDATE_BODY_MAX),
      ctaLabel: tip.cta.label.slice(0, 30),
      ctaUrl: tip.cta.path,
      roles: [tip.role],
    });
  };

  const switchKind = (kind: UpdateKind) => {
    // Media belongs to one kind: switching between image and video starts that part over.
    const keepMedia = kind === draft.kind;
    set({ kind, mediaUrl: keepMedia ? draft.mediaUrl : "", posterUrl: kind === "video" && keepMedia ? draft.posterUrl : "", durationSeconds: kind === "video" && keepMedia ? draft.durationSeconds : "" });
  };

  return (
    <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
      <CardHead
        title={draft.id ? "Edit update" : "New update"}
        action={<button type="button" onClick={onClose} aria-label="Close editor" className="grid h-9 w-9 place-items-center rounded-full bg-app-canvas text-app-ink-soft hover:text-app-ink"><Icon name="x" size={14} /></button>}
      />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Kind of update">
            {UPDATE_KINDS.map((kind) => (
              <button key={kind.value} type="button" role="tab" aria-selected={draft.kind === kind.value} data-update-kind={kind.value} onClick={() => switchKind(kind.value)} className={cx("inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold", draft.kind === kind.value ? "bg-app-ink text-white" : "border border-app-line bg-white")}>
                <Icon name={kind.value === "video" ? "play" : kind.value === "image" ? "image" : kind.value === "motion" ? "sparkle" : "document"} size={13} /> {kind.label}
              </button>
            ))}
          </div>

          {tipsForRoles.length > 0 && !draft.id && (
            <div>
              <FieldLabel htmlFor="upd-tip">Start from a weekly tip <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
              <select id="upd-tip" value="" onChange={(event) => fromTip(event.target.value)} className="min-h-[48px] w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px]">
                <option value="">Pick a tip to fill the card…</option>
                {UPDATE_ROLES.filter((role) => draft.roles.includes(role.value)).map((role) => (
                  <optgroup key={role.value} label={role.label}>
                    {tipsForRoles.filter((tip) => tip.role === role.value).map((tip) => <option key={tip.id} value={tip.id}>{tip.title}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div>
            <FieldLabel htmlFor="upd-title">Title</FieldLabel>
            <TextInput id="upd-title" value={draft.title} maxLength={UPDATE_TITLE_MAX} placeholder="Post on your Status every day this week" onChange={(event) => set({ title: event.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="upd-body">{draft.kind === "text" || draft.kind === "motion" ? "Words on the card" : "Caption"} {draft.kind === "image" || draft.kind === "video" ? <span className="font-normal text-app-ink-soft">(optional)</span> : null}</FieldLabel>
            <textarea
              id="upd-body"
              value={draft.body}
              maxLength={UPDATE_BODY_MAX}
              rows={draft.kind === "motion" ? 6 : 4}
              placeholder={draft.kind === "motion" ? "One idea per line. Each line animates in after the last." : "Keep it short: one tip people can use today."}
              onChange={(event) => set({ body: event.target.value })}
              className="w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.45]"
            />
            <p className="m-0 mt-1 text-right text-[12px] text-app-ink-faint">{draft.body.length}/{UPDATE_BODY_MAX}</p>
          </div>

          {(draft.kind === "text" || draft.kind === "motion") && (
            <div className="grid gap-3">
              <div>
                <FieldLabel>Colour</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {UPDATE_THEMES.map((theme) => (
                    <button key={theme.value} type="button" onClick={() => set({ theme: theme.value })} aria-label={theme.label} aria-pressed={draft.theme === theme.value} className={cx("h-9 w-9 rounded-full border-2", draft.theme === theme.value ? "border-app-ink ring-2 ring-app-ink/20" : "border-white shadow-[0_0_0_1px_rgba(14,42,56,0.15)]")} style={{ background: theme.bg }} />
                  ))}
                </div>
              </div>
              {draft.kind === "motion" && (
                <div>
                  <FieldLabel>Motion</FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {MOTION_STYLES.map((style) => (
                      <button key={style.value} type="button" onClick={() => { set({ motion: style.value }); setReplay((n) => n + 1); }} aria-pressed={draft.motion === style.value} className={cx("min-h-[36px] rounded-full px-3.5 text-[13px] font-bold", draft.motion === style.value ? "bg-app-ink text-white" : "border border-app-line bg-white")}>
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {draft.kind === "image" && (
            <div className="grid gap-2">
              <FieldLabel>Picture</FieldLabel>
              <input ref={imageInput} type="file" accept={UPDATE_IMAGE_TYPES.join(",")} className="sr-only" data-update-image-file="" onChange={(event) => { void upload("media", event.target.files?.[0]); event.target.value = ""; }} />
              <PillButton size="md" tone="white" busy={imageBusy === "media"} onClick={() => imageInput.current?.click()}>
                <Icon name="upload" size={15} /> {draft.mediaUrl ? "Replace the picture" : "Choose a picture (JPG, PNG, WebP or GIF, up to 5 MB)"}
              </PillButton>
              <p className="m-0 text-[12.5px] text-app-ink-soft">Tall pictures (9:16, like 1080 × 1920) fill the screen best. A GIF plays as motion.</p>
            </div>
          )}

          {draft.kind === "video" && (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Video">
                {(["upload", "link"] as const).map((value) => (
                  <button key={value} type="button" role="tab" aria-selected={videoTab === value} onClick={() => setVideoTab(value)} className={cx("min-h-[36px] rounded-full px-3.5 text-[13px] font-bold", videoTab === value ? "bg-app-ink text-white" : "border border-app-line bg-white")}>
                    {value === "upload" ? "Upload a file" : "Paste a YouTube or Vimeo link"}
                  </button>
                ))}
              </div>
              {videoTab === "upload" ? (
                <div className="grid gap-2">
                  <input ref={videoInput} type="file" accept={UPDATE_VIDEO_TYPES.join(",")} className="sr-only" data-update-video-file="" onChange={(event) => { void upload("video", event.target.files?.[0]); event.target.value = ""; }} />
                  <PillButton size="md" tone="white" busy={progress !== null} onClick={() => videoInput.current?.click()}>
                    <Icon name="upload" size={15} /> {isOwnUpdateFile(draft.mediaUrl, storageBase) ? "Replace the video" : "Choose a video (MP4 or WebM, up to 50 MB)"}
                  </PillButton>
                  {progress !== null && (
                    <div className="h-2 overflow-hidden rounded-full bg-app-track" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
                      <div className="h-full bg-app-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  )}
                  <p className="m-0 text-[12.5px] text-app-ink-soft">Short and upright works best: under a minute, filmed on a phone.</p>
                </div>
              ) : (
                <div>
                  <FieldLabel htmlFor="upd-link">YouTube or Vimeo link</FieldLabel>
                  <TextInput id="upd-link" value={isOwnUpdateFile(draft.mediaUrl, storageBase) ? "" : draft.mediaUrl} placeholder="https://youtu.be/…" onChange={(event) => set({ mediaUrl: event.target.value })} />
                  {draft.mediaUrl.trim() && !isOwnUpdateFile(draft.mediaUrl, storageBase) && (
                    <p className={cx("m-0 mt-1.5 text-[12.5px] font-semibold", link ? "text-app-success" : "text-app-danger")}>
                      {link ? `${link.kind === "youtube" ? "YouTube" : "Vimeo"} video found.` : "Only YouTube and Vimeo links work here. For anything else, upload the file."}
                    </p>
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <div>
                  <FieldLabel>Cover picture <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
                  <div className="flex items-center gap-2">
                    <input ref={posterInput} type="file" accept={UPDATE_IMAGE_TYPES.join(",")} className="sr-only" onChange={(event) => { void upload("poster", event.target.files?.[0]); event.target.value = ""; }} />
                    <PillButton size="sm" tone="white" busy={imageBusy === "poster"} onClick={() => posterInput.current?.click()}>{draft.posterUrl ? "Change" : "Upload"}</PillButton>
                    {draft.posterUrl && <button type="button" onClick={() => set({ posterUrl: "" })} className="text-[13px] font-bold underline">Remove</button>}
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="upd-duration">Length (seconds)</FieldLabel>
                  <TextInput id="upd-duration" inputMode="numeric" value={draft.durationSeconds} placeholder="30" onChange={(event) => set({ durationSeconds: event.target.value.replace(/\D/g, "").slice(0, 3) })} />
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="upd-cta-label">Button <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
              <TextInput id="upd-cta-label" value={draft.ctaLabel} maxLength={30} placeholder="Make an advert" onChange={(event) => set({ ctaLabel: event.target.value })} />
            </div>
            <div>
              <FieldLabel htmlFor="upd-cta-url">Button link</FieldLabel>
              <TextInput id="upd-cta-url" value={draft.ctaUrl} placeholder="/home/ads" onChange={(event) => set({ ctaUrl: event.target.value })} />
              {draft.ctaLabel.trim() && !safeCtaUrl(draft.ctaUrl) && <p className="m-0 mt-1 text-[12.5px] font-semibold text-app-danger">A page in the app (like /home/ads) or an https link.</p>}
            </div>
          </div>

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 p-0 text-[13.5px] font-bold">Who sees it</legend>
            <div className="flex flex-wrap gap-1.5">
              {UPDATE_ROLES.map((role) => {
                const on = draft.roles.includes(role.value);
                return (
                  <label key={role.value} className={cx("inline-flex min-h-[36px] cursor-pointer items-center rounded-full border px-3 text-[13px] font-bold focus-within:ring-2 focus-within:ring-app-ink/30", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set({ roles: on ? draft.roles.filter((item) => item !== role.value) : [...draft.roles, role.value] })} />
                    {role.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="upd-start">Starts</FieldLabel>
              <TextInput id="upd-start" type="datetime-local" value={draft.publishAt} onChange={(event) => set({ publishAt: event.target.value })} />
              <button type="button" onClick={() => set({ publishAt: toLocalInput(new Date()) })} className="mt-1 text-[12.5px] font-bold underline">Now</button>
            </div>
            <div>
              <FieldLabel htmlFor="upd-end">Ends</FieldLabel>
              <TextInput id="upd-end" type="datetime-local" value={draft.expiresAt} onChange={(event) => set({ expiresAt: event.target.value })} />
              <div className="mt-1 flex flex-wrap gap-x-3">
                {EXPIRY_CHOICES.map((choice) => (
                  <button key={choice.days} type="button" onClick={() => set({ expiresAt: choice.days ? addDays(draft.publishAt, choice.days) : "" })} className="text-[12.5px] font-bold underline">{choice.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
            <span>
              <span className="block text-[14px] font-bold">Published</span>
              <span className="block text-[12.5px] text-app-ink-soft">{draft.published ? "Shows between the start and end dates." : "Draft: nobody sees it yet."}</span>
            </span>
            <Toggle on={draft.published} onChange={(published) => set({ published })} label="Published" />
          </div>

          {error && <Notice>{error}</Notice>}
          {saved && <Notice tone="success">{saved}</Notice>}

          <div className="flex flex-wrap items-center gap-2">
            <PillButton size="md" tone="ink" busy={saving} onClick={onSave} data-update-save="">Save</PillButton>
            {draft.id && <PillButton size="md" tone="white" disabled={saving} onClick={onDelete}>Delete</PillButton>}
          </div>
        </div>

        <div className="grid content-start gap-2">
          <FieldLabel>Preview</FieldLabel>
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[20px] bg-black shadow-[0_20px_50px_-30px_rgba(14,42,56,0.8)]">
            <UpdateSlide update={preview} restartKey={`${replay}-${draft.kind}-${draft.motion}`} muted />
            {preview.kind === "video" && !preview.video && <p className="absolute inset-x-0 top-1/3 m-0 px-6 text-center text-[13px] font-bold text-white/80">Upload a video or paste a link to see it here.</p>}
            {preview.kind === "image" && !preview.imageUrl && <p className="absolute inset-x-0 top-1/3 m-0 px-6 text-center text-[13px] font-bold text-white/80">Upload a picture to see it here.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton size="sm" tone="white" onClick={() => setReplay((n) => n + 1)}><Icon name="refresh" size={13} /> Replay</PillButton>
            <PillButton size="sm" tone="white" onClick={onPlay}><Icon name="play" size={13} /> Full screen</PillButton>
          </div>
        </div>
      </div>
    </Card>
  );
}
