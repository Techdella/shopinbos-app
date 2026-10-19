"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useMemo, useRef, useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui";
import {
  HELP_POSTER_TYPES,
  HELP_TOPICS,
  HELP_VIDEO_LANGUAGES,
  HELP_VIDEO_ROLES,
  HELP_VIDEO_TYPES,
  durationLabel,
  helpUploadProblem,
  parseVideoLink,
  topicTitle,
  videoSource,
  type HelpVideoRole,
} from "@shared/help-videos";

// /admin/help-videos: every topic's video per language. Upload a file (the browser sends it straight to Storage
// with a one-time signed URL; the server then checks the bytes) or paste a YouTube/Vimeo link, set the poster,
// who sees it, the language, and publish. Help only shows published videos.

export interface HelpVideoAdminRow {
  id: string;
  topic: string;
  title: string;
  roles: string[];
  language: string;
  videoUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  published: boolean;
  updatedAt: string;
}

interface Draft {
  id: string | null;
  topic: string;
  title: string;
  roles: HelpVideoRole[];
  language: string;
  videoUrl: string;
  posterUrl: string;
  durationSeconds: string;
  published: boolean;
}

const LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(HELP_VIDEO_LANGUAGES.map((lang) => [lang.code, lang.label]));
const ROLE_LABEL: Record<string, string> = Object.fromEntries(HELP_VIDEO_ROLES.map((role) => [role.value, role.label]));

function toDraft(row: HelpVideoAdminRow): Draft {
  return {
    id: row.id,
    topic: row.topic,
    title: row.title,
    roles: row.roles.filter((role): role is HelpVideoRole => HELP_VIDEO_ROLES.some((item) => item.value === role)),
    language: row.language,
    videoUrl: row.videoUrl ?? "",
    posterUrl: row.posterUrl ?? "",
    durationSeconds: row.durationSeconds ? String(row.durationSeconds) : "",
    published: row.published,
  };
}

function blankDraft(): Draft {
  const topic = HELP_TOPICS[0]!;
  return { id: null, topic: topic.key, title: topic.title, roles: [...topic.roles], language: "en", videoUrl: "", posterUrl: "", durationSeconds: "", published: false };
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
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "Storage refused a file that big. Raise the bucket limit (see the migration notes) or paste a YouTube or Vimeo link." : "The upload didn't finish. Try again.")));
    xhr.onerror = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
    xhr.send(file);
  });
}

/** The length of a local video file in whole seconds, read by the browser. */
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

export function HelpVideosManager({ initial, storageBase, migrationNeeded }: { initial: HelpVideoAdminRow[]; storageBase: string; migrationNeeded: boolean }) {
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const byTopic = useMemo(() => {
    const groups = new Map<string, HelpVideoAdminRow[]>();
    for (const topic of HELP_TOPICS) groups.set(topic.key, []);
    for (const row of rows) groups.set(row.topic, [...(groups.get(row.topic) ?? []), row]);
    return [...groups.entries()];
  }, [rows]);
  const live = rows.filter((row) => row.published && row.videoUrl).length;

  if (migrationNeeded) {
    return <Notice tone="info">Help videos need a database update first. Run docs/migrations/2026-10-18-help-videos.sql, then reload this page.</Notice>;
  }

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const payload = {
        topic: draft.topic,
        title: draft.title,
        roles: draft.roles,
        language: draft.language,
        videoUrl: draft.videoUrl.trim() || null,
        posterUrl: draft.posterUrl.trim() || null,
        durationSeconds: draft.durationSeconds ? Math.round(Number(draft.durationSeconds)) || null : null,
        published: draft.published,
      };
      const row = await readJson<HelpVideoAdminRow>(
        await fetch(draft.id ? `/api/admin/help-videos/${draft.id}` : "/api/admin/help-videos", {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      const clean = { ...row, updatedAt: String(row.updatedAt) };
      setRows((current) => (draft.id ? current.map((item) => (item.id === row.id ? clean : item)) : [...current, clean]));
      setDraft(toDraft(clean));
      setSaved(clean.published ? "Saved. It's live in Help now." : "Saved as a draft. Help won't show it until you publish.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !(await confirmDialog("Delete this video? Help stops offering it straight away."))) return;
    setSaving(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/admin/help-videos/${draft.id}`, { method: "DELETE" }));
      setRows((current) => current.filter((row) => row.id !== draft.id));
      setDraft(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That didn't delete. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
        <CardHead
          title="Videos by topic"
          sub={`${live} live · ${rows.length - live} draft${rows.length - live === 1 ? "" : "s"}. A topic shows in Help only once it has a published video.`}
          action={<PillButton size="sm" tone="ink" onClick={() => { setDraft(blankDraft()); setError(null); setSaved(null); }}><Icon name="plus" size={14} /> Add a video</PillButton>}
        />
        <ul className="m-0 grid list-none gap-1 p-0">
          {byTopic.map(([topic, items]) => (
            <li key={topic} className="border-t border-app-line pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="min-w-0 flex-1 text-[13px] font-extrabold">{topicTitle(topic)}</span>
                <code className="text-[11.5px] text-app-ink-faint">{topic}</code>
              </div>
              {items.length === 0 ? (
                <p className="m-0 px-1 pb-2 text-[13px] text-app-ink-soft">No video yet.</p>
              ) : (
                items.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    data-help-video-row={row.topic}
                    onClick={() => { setDraft(toDraft(row)); setError(null); setSaved(null); }}
                    className={cx("mb-1 flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-app-canvas", draft?.id === row.id && "bg-app-canvas")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{row.title}</span>
                      <span className="block text-[12px] text-app-ink-soft">
                        {LANGUAGE_LABEL[row.language] ?? row.language} · {row.roles.map((role) => ROLE_LABEL[role] ?? role).join(", ")}
                        {row.videoUrl ? ` · ${durationLabel(row.durationSeconds)}` : ""}
                      </span>
                    </span>
                    {row.published && row.videoUrl ? <Pill tone="success" dot>Live</Pill> : row.videoUrl ? <Pill tone="info">Ready to publish</Pill> : <Pill tone="muted">Needs a video</Pill>}
                  </button>
                ))
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="min-w-0">
        {draft ? (
          <Editor draft={draft} setDraft={setDraft} storageBase={storageBase} saving={saving} error={error} saved={saved} setError={setError} onSave={() => void save()} onDelete={() => void remove()} onClose={() => setDraft(null)} />
        ) : (
          <Card className="p-4 sm:p-5">
            <CardHead title="Pick a video to edit" sub="Every topic starts as a draft. Record a one-minute video, upload it (MP4 or WebM, up to 50 MB) or paste a YouTube or Vimeo link, then publish." />
          </Card>
        )}
      </div>
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
}) {
  const [tab, setTab] = useState<"upload" | "link">(draft.videoUrl && parseVideoLink(draft.videoUrl) ? "link" : "upload");
  const [progress, setProgress] = useState<number | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const source = videoSource(draft.videoUrl.trim(), storageBase);
  const link = draft.videoUrl.trim() ? parseVideoLink(draft.videoUrl) : null;
  const poster = draft.posterUrl || (source?.kind === "youtube" ? `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg` : "");

  const upload = async (kind: "video" | "poster", file: File | undefined) => {
    if (!file) return;
    setError(null);
    const problem = helpUploadProblem(kind, file.type, file.size);
    if (problem) return setError(problem);
    try {
      if (kind === "video") setProgress(0);
      else setPosterBusy(true);
      const target = await readJson<{ signedUrl: string; publicUrl: string }>(
        await fetch("/api/admin/help-videos/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, type: file.type, size: file.size }) }),
      );
      await putFile(target.signedUrl, file, (fraction) => kind === "video" && setProgress(fraction));
      if (kind === "video") {
        const seconds = await fileDuration(file);
        setDraft({ ...draft, videoUrl: target.publicUrl, durationSeconds: seconds ? String(seconds) : draft.durationSeconds });
      } else {
        setDraft({ ...draft, posterUrl: target.publicUrl });
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The upload didn't finish. Try again.");
    } finally {
      setProgress(null);
      setPosterBusy(false);
    }
  };

  const topic = HELP_TOPICS.find((item) => item.key === draft.topic);

  return (
    <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
      <CardHead
        title={draft.id ? "Edit video" : "Add a video"}
        sub={topic ? `Shows in Help on: ${topic.paths.slice(0, 4).join(", ")}${topic.paths.length > 4 ? "…" : ""}` : undefined}
        action={<button type="button" onClick={onClose} aria-label="Close editor" className="grid h-9 w-9 place-items-center rounded-full bg-app-canvas text-app-ink-soft hover:text-app-ink"><Icon name="x" size={14} /></button>}
      />
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="hv-topic">Topic</FieldLabel>
            <select
              id="hv-topic"
              value={draft.topic}
              disabled={Boolean(draft.id)}
              onChange={(event) => {
                const next = HELP_TOPICS.find((item) => item.key === event.target.value)!;
                set({ topic: next.key, title: next.title, roles: [...next.roles] });
              }}
              className="min-h-[48px] w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] disabled:bg-app-canvas"
            >
              {HELP_TOPICS.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="hv-language">Language</FieldLabel>
            <select id="hv-language" value={draft.language} disabled={Boolean(draft.id)} onChange={(event) => set({ language: event.target.value })} className="min-h-[48px] w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] disabled:bg-app-canvas">
              {HELP_VIDEO_LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="hv-title">Title</FieldLabel>
          <TextInput id="hv-title" value={draft.title} maxLength={120} onChange={(event) => set({ title: event.target.value })} />
        </div>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[13.5px] font-bold">Who sees it</legend>
          <div className="flex flex-wrap gap-1.5">
            {HELP_VIDEO_ROLES.map((role) => {
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

        <div>
          <div className="mb-2 flex gap-1.5" role="tablist" aria-label="Video">
            {(["upload", "link"] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cx("min-h-[36px] rounded-full px-3.5 text-[13px] font-bold", tab === value ? "bg-app-ink text-white" : "border border-app-line bg-white")}>
                {value === "upload" ? "Upload a file" : "Paste a YouTube or Vimeo link"}
              </button>
            ))}
          </div>
          {tab === "upload" ? (
            <div className="grid gap-2">
              <input ref={videoInput} type="file" accept={HELP_VIDEO_TYPES.join(",")} className="sr-only" data-help-video-file="" onChange={(event) => { void upload("video", event.target.files?.[0]); event.target.value = ""; }} />
              <PillButton size="md" tone="white" busy={progress !== null} onClick={() => videoInput.current?.click()}>
                <Icon name="upload" size={15} /> {source?.kind === "file" ? "Replace the video" : "Choose a video (MP4 or WebM, up to 50 MB)"}
              </PillButton>
              {progress !== null && (
                <div className="h-2 overflow-hidden rounded-full bg-app-track" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
                  <div className="h-full bg-app-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
              {source?.kind === "file" && <p className="m-0 truncate text-[12.5px] text-app-ink-soft">Uploaded: {draft.videoUrl.split("/").pop()}</p>}
            </div>
          ) : (
            <div>
              <FieldLabel htmlFor="hv-link">YouTube or Vimeo link</FieldLabel>
              <TextInput id="hv-link" value={source?.kind === "file" ? "" : draft.videoUrl} placeholder="https://youtu.be/…" onChange={(event) => set({ videoUrl: event.target.value })} />
              {draft.videoUrl.trim() && source?.kind !== "file" && (
                <p className={cx("m-0 mt-1.5 text-[12.5px] font-semibold", link ? "text-app-success" : "text-app-danger")}>
                  {link ? `${link.kind === "youtube" ? "YouTube" : "Vimeo"} video found.` : "Only YouTube and Vimeo links work here. For anything else, upload the file."}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <div>
            <FieldLabel>Poster picture <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
            <div className="flex items-center gap-3">
              <span className="h-14 w-24 shrink-0 overflow-hidden rounded-[12px] bg-app-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {poster ? <img src={poster} alt="" className="h-full w-full object-cover" /> : null}
              </span>
              <input ref={posterInput} type="file" accept={HELP_POSTER_TYPES.join(",")} className="sr-only" onChange={(event) => { void upload("poster", event.target.files?.[0]); event.target.value = ""; }} />
              <PillButton size="sm" tone="white" busy={posterBusy} onClick={() => posterInput.current?.click()}>{draft.posterUrl ? "Change" : "Upload"}</PillButton>
              {draft.posterUrl && <button type="button" onClick={() => set({ posterUrl: "" })} className="text-[13px] font-bold underline">Remove</button>}
            </div>
            {!draft.posterUrl && source?.kind === "youtube" && <p className="m-0 mt-1 text-[12px] text-app-ink-soft">Uses the YouTube thumbnail until you upload one.</p>}
          </div>
          <div>
            <FieldLabel htmlFor="hv-duration">Length (seconds)</FieldLabel>
            <TextInput id="hv-duration" inputMode="numeric" value={draft.durationSeconds} placeholder="60" onChange={(event) => set({ durationSeconds: event.target.value.replace(/\D/g, "").slice(0, 3) })} />
          </div>
        </div>

        {source && (
          <div>
            <FieldLabel>Preview</FieldLabel>
            <div className="aspect-video w-full overflow-hidden rounded-[16px] bg-black">
              {source.kind === "file" ? (
                <video key={source.url} src={source.url} poster={poster || undefined} controls playsInline className="h-full w-full" data-help-video="preview" />
              ) : (
                <iframe key={source.embedUrl} src={source.embedUrl} title="Preview" allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen className="h-full w-full border-0" data-help-video="preview" />
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
          <span>
            <span className="block text-[14px] font-bold">Published</span>
            <span className="block text-[12.5px] text-app-ink-soft">{draft.published ? "Help offers this video." : "Draft: Help doesn't show it yet."}</span>
          </span>
          <Toggle on={draft.published} onChange={(published) => set({ published })} label="Published" />
        </div>

        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}

        <div className="flex flex-wrap items-center gap-2">
          <PillButton size="md" tone="ink" busy={saving} onClick={onSave} data-help-video-save="">Save</PillButton>
          {draft.id && <PillButton size="md" tone="white" disabled={saving} onClick={onDelete}>Delete</PillButton>}
        </div>
      </div>
    </Card>
  );
}
