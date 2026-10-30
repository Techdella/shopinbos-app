import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError } from "@/lib/api";
import {
  AUTOSAVE_MS,
  canRedo,
  canUndo,
  createHistory,
  draftBackupKey,
  draftVersion,
  fetchStoreEditor,
  publishStoreDraft,
  pushHistory,
  readBackup,
  redoHistory,
  replacePresent,
  saveStoreDraft,
  snapshotKey,
  undoHistory,
  usableBackup,
  writeBackup,
  type DraftBackup,
  type EdHistory,
  type EdSnapshot,
  type EditorLoad,
  type SaveStatus,
} from "@/lib/store-editor";

// The editor's state (app/store-editor.tsx): an undo history of whole drafts, a debounced autosave checked against
// the version the phone started from, a copy kept on the phone until the server has it (so a dropped network or a
// closed app loses nothing), and publish. Every change is drawn on the canvas at once; saving happens behind it.

export interface StoreEditorState {
  snapshot: EdSnapshot;
  published: EdSnapshot | null;
  status: SaveStatus;
  /** Changed something in this session (the status then says Saved / Saving… instead of Live preview). */
  edited: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** A change; `key` merges quick edits of the same thing (typing) into one undo step. */
  commit: (next: EdSnapshot | ((current: EdSnapshot) => EdSnapshot), key?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Saves now (waits for a save in flight); the saved version, or null when it couldn't. */
  flush: () => Promise<string | null>;
  version: () => string | null;
  /** A draft the server already saved (Rex's change, a publish): one undo step, nothing to save. */
  adoptSaved: (draft: EdSnapshot, version: string | null, asStep: boolean) => void;
  publish: () => Promise<{ url: string | null }>;
  /** The draft changed on another device: take the newer one, or keep the phone's. */
  resolveConflict: (keep: "mine" | "theirs") => Promise<void>;
  /** A copy from last time was put back on load. */
  restored: boolean;
}

export function useStoreEditor(load: EditorLoad & { draft: EdSnapshot }): StoreEditorState {
  const storeId = load.store.id;
  const backupKey = draftBackupKey(storeId);
  const restoredBackup = useMemo(() => usableBackup(readBackup(backupKey) as DraftBackup | null, storeId, load.draft), [backupKey, storeId, load.draft]);
  const [history, setHistory] = useState<EdHistory<EdSnapshot>>(() => {
    const start = createHistory(load.draft);
    return restoredBackup ? pushHistory(start, restoredBackup.snapshot) : start;
  });
  const [published, setPublished] = useState<EdSnapshot | null>(load.published);
  const [status, setStatus] = useState<SaveStatus>(restoredBackup ? "saving" : "idle");
  const [edited, setEdited] = useState(Boolean(restoredBackup));

  const versionRef = useRef<string | null>(load.version || null);
  const savedKey = useRef(snapshotKey(load.draft));
  const presentRef = useRef(history.present);
  useLayoutEffect(() => {
    presentRef.current = history.present;
  }, [history.present]);
  const saving = useRef<Promise<string | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflict = useRef(false);

  const save = useCallback(async (force = false): Promise<string | null> => {
    if (saving.current) {
      await saving.current;
    }
    const snapshot = presentRef.current;
    const key = snapshotKey(snapshot);
    if (key === savedKey.current && !force) return versionRef.current;
    if (conflict.current && !force) return null;
    setStatus("saving");
    const run = (async () => {
      try {
        const result = await saveStoreDraft(snapshot, versionRef.current, force);
        versionRef.current = result.version;
        savedKey.current = key;
        conflict.current = false;
        if (snapshotKey(presentRef.current) === key) {
          writeBackup(backupKey, null);
          setStatus("saved");
        }
        return result.version;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          conflict.current = true;
          setStatus("conflict");
        } else {
          setStatus("offline");
        }
        return null;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    return run;
  }, [backupKey]);

  // Autosave: a moment after the last change. The phone keeps a copy until the server has it.
  useEffect(() => {
    const key = snapshotKey(history.present);
    if (key === savedKey.current) return;
    writeBackup(backupKey, { storeId, baseVersion: versionRef.current ?? "", snapshot: history.present, savedAt: Date.now() } satisfies DraftBackup);
    if (conflict.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [history.present, backupKey, storeId, save]);

  // Offline: try again when the app comes back to the front, and every little while.
  useEffect(() => {
    if (status !== "offline") return;
    const retry = setInterval(() => void save(), 8000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void save();
    });
    return () => {
      clearInterval(retry);
      sub.remove();
    };
  }, [status, save]);

  // Leaving the app mid-change: save straight away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && snapshotKey(presentRef.current) !== savedKey.current) void save();
    });
    return () => sub.remove();
  }, [save]);

  const commit = useCallback((next: EdSnapshot | ((current: EdSnapshot) => EdSnapshot), key?: string) => {
    setHistory((current) => {
      const value = typeof next === "function" ? next(current.present) : next;
      if (value === current.present || snapshotKey(value) === snapshotKey(current.present)) return current;
      return pushHistory(current, value, { key: key ?? null });
    });
    setEdited(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => undoHistory(current));
    setEdited(true);
  }, []);
  const redo = useCallback(() => {
    setHistory((current) => redoHistory(current));
    setEdited(true);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    return save();
  }, [save]);

  const adoptSaved = useCallback((draft: EdSnapshot, version: string | null, asStep: boolean) => {
    if (version) versionRef.current = version;
    savedKey.current = snapshotKey(draft);
    conflict.current = false;
    setHistory((current) => (asStep ? pushHistory(current, draft) : replacePresent(current, draft)));
    setStatus("saved");
    writeBackup(backupKey, null);
  }, [backupKey]);

  const publish = useCallback(async () => {
    const version = await flush();
    if (version === null && snapshotKey(presentRef.current) !== savedKey.current) {
      throw new ApiError(conflict.current ? "conflict" : "offline", conflict.current ? 409 : 0);
    }
    const result = await publishStoreDraft(versionRef.current);
    setPublished(result.published);
    // The server publishes its own copy (blank search titles filled in, one shared header): that is the draft now.
    if (result.draft && snapshotKey(result.draft) === snapshotKey(presentRef.current)) {
      versionRef.current = result.version || versionRef.current;
    } else if (result.draft && snapshotKey(presentRef.current) === savedKey.current) {
      adoptSaved(result.draft, result.version, false);
    }
    return { url: result.url };
  }, [flush, adoptSaved]);

  const resolveConflict = useCallback(async (keep: "mine" | "theirs") => {
    if (keep === "mine") {
      conflict.current = false;
      await save(true);
      return;
    }
    const fresh = await fetchStoreEditor();
    if (!fresh.draft) return;
    versionRef.current = fresh.version || null;
    savedKey.current = snapshotKey(fresh.draft);
    conflict.current = false;
    writeBackup(backupKey, null);
    setPublished(fresh.published);
    setHistory(createHistory(fresh.draft));
    setStatus("saved");
  }, [save, backupKey]);

  return {
    snapshot: history.present,
    published,
    status,
    edited,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    commit,
    undo,
    redo,
    flush,
    version: () => versionRef.current,
    adoptSaved,
    publish,
    resolveConflict,
    restored: Boolean(restoredBackup),
  };
}

export { draftVersion };
