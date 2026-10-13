"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useEditorT } from "./i18n";

/** Selection blue used for the outline, name tag and active tree rows (as in the prototype). */
export const SELECT_BLUE = "#2F66F6";

export function IconButton({
  icon,
  label,
  active = false,
  size = 18,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean; size?: number }) {
  const { tx } = useEditorT();
  return (
    <button
      type="button"
      aria-label={tx(label)}
      title={tx(label)}
      className={cx(
        "inline-grid h-10 w-10 shrink-0 place-items-center rounded-[12px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F66F6] disabled:cursor-not-allowed disabled:opacity-35",
        active ? "bg-[#EAF0FF] text-[#2F66F6]" : "text-app-ink-soft hover:bg-app-canvas hover:text-app-ink",
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const { tx } = useEditorT();
  return (
    <div role="radiogroup" aria-label={tx(label)} className={cx("flex rounded-[12px] bg-app-canvas p-1", className)}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-9 min-w-0 flex-1 truncate rounded-[9px] px-2 text-[13px] font-semibold transition",
              on ? "bg-white text-app-ink shadow-[0_1px_3px_rgba(22,20,31,.12)]" : "text-app-ink-soft hover:text-app-ink",
            )}
          >
            {tx(option.label)}
          </button>
        );
      })}
    </div>
  );
}

export function PanelHeading({ title, sub, onClose, onBack }: { title: ReactNode; sub?: ReactNode; onClose?: () => void; onBack?: () => void }) {
  const { tx } = useEditorT();
  return (
    <div className="flex items-start gap-2 px-4 pb-2 pt-4">
      {onBack ? <IconButton icon="arrowLeft" label="Back" onClick={onBack} className="-ml-2 h-9 w-9" size={16} /> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-bold text-app-ink">{typeof title === "string" ? tx(title) : title}</h2>
        {sub ? <p className="mt-0.5 text-[12.5px] leading-5 text-app-ink-soft">{typeof sub === "string" ? tx(sub) : sub}</p> : null}
      </div>
      {onClose ? <IconButton icon="x" label="Close panel" onClick={onClose} className="-mr-2 h-9 w-9" size={16} /> : null}
    </div>
  );
}

/** Small popover menu that closes on outside click and Escape. */
export function Menu({
  trigger,
  children,
  align = "right",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  label: string;
}) {
  const { tx } = useEditorT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div role="menu" aria-label={tx(label)} className={cx("absolute top-full z-50 mt-1 min-w-[200px] rounded-[14px] border border-app-line bg-white p-1.5 shadow-[0_18px_50px_rgba(22,20,31,.16)]", align === "right" ? "right-0" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger = false, disabled = false }: { icon?: IconName; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[13.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "text-app-danger hover:bg-app-danger-tint" : "text-app-ink hover:bg-app-canvas",
      )}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
    </button>
  );
}

export function NavRow({ label, sub, onClick, href }: { label: string; sub?: string; onClick?: () => void; href?: string }) {
  const { tx } = useEditorT();
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-app-ink">{tx(label)}</span>
        {sub ? <span className="mt-0.5 block text-[12.5px] leading-5 text-app-ink-soft">{tx(sub)}</span> : null}
      </span>
      <Icon name="chevRight" size={15} className="shrink-0 text-app-ink-faint" />
    </>
  );
  const className = "flex min-h-12 w-full items-center gap-3 border-b border-app-line py-3 text-left last:border-b-0 hover:opacity-80";
  if (href) return <a href={href} className={className}>{inner}</a>;
  return <button type="button" onClick={onClick} className={className}>{inner}</button>;
}

export const inputClass = "h-10 w-full min-w-0 rounded-[10px] border border-app-line bg-white px-3 text-[13.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-[#2F66F6]";
export const textareaClass = "w-full min-w-0 rounded-[10px] border border-app-line bg-white px-3 py-2 text-[13.5px] leading-5 text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-[#2F66F6]";

export function FieldShell({ id, label, help, children, inline = false }: { id?: string; label: string; help?: string; children: ReactNode; inline?: boolean }) {
  const { tx } = useEditorT();
  return (
    <div className={cx("py-2", inline && "flex items-center justify-between gap-3")}>
      <label htmlFor={id} className={cx("block text-[13px] font-semibold text-app-ink", !inline && "mb-1.5")}>{tx(label)}</label>
      {children}
      {help ? <p className="mt-1.5 text-[12px] leading-[18px] text-app-ink-soft">{tx(help)}</p> : null}
    </div>
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Opens a file picker and resolves with the chosen file (or null). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
