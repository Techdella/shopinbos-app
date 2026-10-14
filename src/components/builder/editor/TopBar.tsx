"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { PublishState } from "./editor-logic";
import { DEVICE_LABELS, DEVICE_WIDTHS, type Device } from "./Canvas";
import { IconButton, Menu, MenuItem } from "./ui";
import { useEditorT } from "./i18n";

const DEVICE_ICONS: Record<Device, IconName> = { desktop: "monitor", tablet: "cards", mobile: "phone" };

export function StatusPill({ status }: { status: PublishState }) {
  const { tx } = useEditorT();
  if (status === "live") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-app-success-tint px-2.5 py-1 text-[12px] font-bold text-app-success">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-app-success" /> {tx("Live")}
      </span>
    );
  }
  if (status === "changes") {
    return <span title={tx("Your store is live. These edits aren't published yet.")} className="inline-flex shrink-0 items-center rounded-full bg-[#FFF3DC] px-2.5 py-1 text-[12px] font-bold text-[#8A5A00]">{tx("Unpublished")}</span>;
  }
  return <span title={tx("Not published yet")} className="inline-flex shrink-0 items-center rounded-full bg-[#EAF0FF] px-2.5 py-1 text-[12px] font-bold text-[#2F66F6]">{tx("Draft")}</span>;
}

export interface TopBarProps {
  themeName: string;
  status: PublishState;
  view: "editor" | "themes";
  onView: (view: "editor" | "themes") => void;
  onBack: () => void;
  pagePicker: ReactNode;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  device: Device;
  onDevice: (device: Device) => void;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onPublish: () => void;
  publishing: boolean;
  canPublish: boolean;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  phone: boolean;
}

export function TopBar(props: TopBarProps) {
  const { t, tx } = useEditorT();
  const editor = props.view === "editor";
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-app-line bg-white px-2 sm:px-3">
      <IconButton icon="arrowLeft" label="Back to your store" onClick={props.onBack} />
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden max-w-[160px] truncate text-[15px] font-bold text-app-ink xl:inline">{props.themeName}</span>
        <StatusPill status={props.status} />
      </div>
      {!props.phone ? (
        <div role="tablist" aria-label={tx("Builder view")} className="ml-1 flex shrink-0 rounded-[12px] bg-app-canvas p-1">
          {(["editor", "themes"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={props.view === view}
              onClick={() => props.onView(view)}
              className={cx("min-h-8 rounded-[9px] px-3 text-[13.5px] font-semibold", props.view === view ? "bg-white text-app-ink shadow-[0_1px_3px_rgba(22,20,31,.12)]" : "text-app-ink-soft hover:text-app-ink")}
            >
              {view === "editor" ? tx("Editor") : tx("Themes")}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 justify-center px-1">
        {editor ? <div className="w-full max-w-[260px] min-w-0">{props.pagePicker}</div> : null}
      </div>
      {editor && !props.phone ? (
        <>
          <IconButton icon="layers" label={props.inspectorOpen ? "Hide settings panel" : "Show settings panel"} active={props.inspectorOpen} onClick={props.onToggleInspector} aria-pressed={props.inspectorOpen} />
          <div role="radiogroup" aria-label={tx("Preview size")} className="hidden shrink-0 items-center rounded-[12px] border border-app-line p-0.5 lg:flex">
            {(["desktop", "tablet", "mobile"] as const).map((device) => (
              <button
                key={device}
                type="button"
                role="radio"
                aria-checked={props.device === device}
                aria-label={t("edk.devicePreview", { device: tx(DEVICE_LABELS[device]), width: DEVICE_WIDTHS[device] })}
                title={tx(DEVICE_LABELS[device])}
                onClick={() => props.onDevice(device)}
                className={cx("grid h-8 w-9 place-items-center rounded-[9px]", props.device === device ? "bg-app-canvas text-app-ink" : "text-app-ink-faint hover:text-app-ink")}
              >
                <Icon name={DEVICE_ICONS[device]} size={16} />
              </button>
            ))}
          </div>
          <div className="lg:hidden">
            <Menu label="Preview size" trigger={({ open, toggle }) => <IconButton icon={DEVICE_ICONS[props.device]} label={t("edk.previewSize", { device: tx(DEVICE_LABELS[props.device]) })} aria-expanded={open} onClick={toggle} />}>
              {(close) => (["desktop", "tablet", "mobile"] as const).map((device) => (
                <MenuItem key={device} icon={DEVICE_ICONS[device]} onClick={() => { props.onDevice(device); close(); }}>
                  {tx(DEVICE_LABELS[device])} · {DEVICE_WIDTHS[device]}{props.device === device ? ` ${tx("(on)")}` : ""}
                </MenuItem>
              ))}
            </Menu>
          </div>
          <IconButton icon="undo" label={t("edk.undo", { keys: `${mod}Z` })} disabled={!props.canUndo} onClick={props.onUndo} />
          <IconButton icon="refresh" label={t("edk.redo", { keys: `${mod}Shift+Z` })} disabled={!props.canRedo} onClick={props.onRedo} className="hidden xl:inline-grid" />
        </>
      ) : null}
      {props.phone && editor ? <IconButton icon="undo" label="Undo" disabled={!props.canUndo} onClick={props.onUndo} /> : null}
      <button
        type="button"
        onClick={props.onPublish}
        disabled={props.publishing || !props.canPublish}
        title={!props.canPublish ? tx("Everything is published") : undefined}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink transition hover:border-app-line-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {props.publishing ? tx("Publishing…") : tx("Publish")}
      </button>
      {!props.phone ? (
        <button
          type="button"
          onClick={props.onSave}
          disabled={!props.dirty || props.saving}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-app-ink px-4 text-[14px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-app-canvas disabled:text-app-ink-faint"
        >
          {props.saving ? tx("Saving…") : tx("Save")}
        </button>
      ) : null}
    </header>
  );
}
