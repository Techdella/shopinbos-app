"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Mascot } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { OPEN_HELP_EVENT, type OpenHelpDetail } from "@/components/simple/HelpButton";
import { SHOWN_ERROR_EVENT } from "@/lib/errors/report-client";
import { storageGet, storageSet } from "@/lib/safe-storage";
import { newStruggleState, onActivity, onClick, onError, onRoute, onScroll, type StruggleReason } from "@/lib/struggle/detect";

// "Peggy can help": when someone looks stuck (an error, tapping something that doesn't respond, scrolling and
// scrolling, going back and forth between pages; see src/lib/struggle/detect.ts), Peggy offers to help. "Yes"
// opens the help panel in a chat with her, starting from what went wrong. Mounted once by the app shell for
// sellers, suppliers and delivery partners. "Don't offer again" is remembered on this device.

const OFF_KEY = "shopinbos:peggy-nudge-off";
const IGNORE = "input, textarea, select, option, label, [contenteditable=true], [data-peggy-nudge], [data-struggle-ignore]";
const TAPPABLE = "button, a, [role=button], [role=tab], [role=menuitem], summary";
/** Scrolls count only right after the wheel, a swipe or a scrolling key (not the page scrolling itself). */
const SCROLL_INPUT_MS = 600;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"]);
const SHOW_MS = 30_000;

type Copy = "error" | "rage" | "scroll" | "wander";
const COPY: Record<StruggleReason, Copy> = { error: "error", rage: "rage", dead: "rage", scroll: "scroll", wander: "wander" };

export function PeggyNudge({ helpOpen }: { helpOpen: boolean }) {
  const t = useT("help");
  const pathname = usePathname();
  const [reason, setReason] = useState<StruggleReason | null>(null);
  const [visible, setVisible] = useState(false);
  const state = useRef(newStruggleState());
  const helpOpenRef = useRef(helpOpen);
  helpOpenRef.current = helpOpen;

  const show = (next: StruggleReason | null) => {
    if (!next || helpOpenRef.current) return;
    // Not on top of a dialog, and never again once they said so.
    if (document.querySelector("[aria-modal=true]") || storageGet("localStorage", OFF_KEY) === "1") return;
    setReason(next);
    requestAnimationFrame(() => setVisible(true));
  };
  const showRef = useRef(show);
  showRef.current = show;

  const hide = () => {
    setVisible(false);
    window.setTimeout(() => setReason(null), 250);
  };

  useEffect(() => {
    if (pathname) showRef.current(onRoute(state.current, pathname, Date.now()));
  }, [pathname]);

  useEffect(() => {
    const s = state.current;
    let changedAt = 0;
    const lastClick = new Map<string, number>();
    const ids = new WeakMap<Element, string>();
    let nextId = 0;
    const keyFor = (element: Element | null) => {
      if (!element) return "";
      let id = ids.get(element);
      if (!id) {
        id = `t${++nextId}`;
        ids.set(element, id);
      }
      return id;
    };

    // Did a click do anything? New content, removed content or new text anywhere on the page counts.
    const changes = new MutationObserver((records) => {
      changedAt = Date.now();
      // An error message appearing (role="alert", as <Notice tone="error"> renders).
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && !node.closest("[data-peggy-nudge]") && (node.matches("[role=alert]") || node.querySelector("[role=alert]"))) {
            showRef.current(onError(s, false, Date.now()));
            return;
          }
        }
      }
    });
    changes.observe(document.body, { childList: true, subtree: true, characterData: true });

    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(IGNORE)) return;
      const key = keyFor(target.closest(TAPPABLE));
      const now = Date.now();
      const changedSince = changedAt > (lastClick.get(key) ?? now);
      lastClick.set(key, now);
      showRef.current(onClick(s, { at: now, x: event.clientX, y: event.clientY, key, changedSince }));
    };

    let scrollInputAt = 0;
    const scrollInput = () => {
      scrollInputAt = Date.now();
    };
    const key = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && !(event.target instanceof Element && event.target.closest(IGNORE))) scrollInputAt = Date.now();
      else onActivity(s);
    };
    const positions = new WeakMap<object, number>();
    const scroll = (event: Event) => {
      const now = Date.now();
      const target = event.target;
      const element = target instanceof Element ? target : null;
      if (element?.closest("[data-peggy-nudge]")) return;
      const top = element ? element.scrollTop : window.scrollY;
      const height = element ? element.clientHeight : window.innerHeight;
      const box = element ?? window;
      const before = positions.get(box);
      positions.set(box, top);
      if (before === undefined || now - scrollInputAt > SCROLL_INPUT_MS) return;
      showRef.current(onScroll(s, top - before, height, now));
    };
    const error = (event: Event) => showRef.current(onError(s, Boolean((event as CustomEvent<{ technical?: boolean }>).detail?.technical), Date.now()));

    document.addEventListener("click", click, { capture: true, passive: true });
    document.addEventListener("scroll", scroll, { capture: true, passive: true });
    document.addEventListener("keydown", key, { capture: true, passive: true });
    window.addEventListener("wheel", scrollInput, { capture: true, passive: true });
    window.addEventListener("touchmove", scrollInput, { capture: true, passive: true });
    window.addEventListener(SHOWN_ERROR_EVENT, error);
    return () => {
      changes.disconnect();
      document.removeEventListener("click", click, { capture: true });
      document.removeEventListener("scroll", scroll, { capture: true });
      document.removeEventListener("keydown", key, { capture: true });
      window.removeEventListener("wheel", scrollInput, { capture: true });
      window.removeEventListener("touchmove", scrollInput, { capture: true });
      window.removeEventListener(SHOWN_ERROR_EVENT, error);
    };
  }, []);

  // Fades away on its own after a while; gone at once when the help panel opens.
  useEffect(() => {
    if (!reason) return;
    if (helpOpen) {
      hide();
      return;
    }
    const timer = window.setTimeout(hide, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [reason, helpOpen]);

  if (!reason) return null;
  const copy = COPY[reason];

  const accept = () => {
    const detail: OpenHelpDetail = { peggy: t(`nudge.${copy}.opener`) };
    window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT, { detail }));
    hide();
  };

  return (
    <div
      data-peggy-nudge
      role="dialog"
      aria-label={t("nudge.label")}
      className="fixed inset-x-4 bottom-4 z-40 font-app text-app-ink sm:left-auto sm:right-5 sm:w-[360px]"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: "opacity 250ms ease-out, transform 250ms ease-out" }}
    >
      <div className="rounded-[22px] border border-app-line bg-white p-4 shadow-[0_18px_40px_-16px_rgba(22,20,31,0.45)]">
        <div className="flex items-start gap-3">
          <Mascot name="peggy" mood="wave" className="h-12 w-12 shrink-0" alt="" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold leading-[1.3]">{t(`nudge.${copy}.title`)}</div>
            <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-app-ink-soft">{t(`nudge.${copy}.body`)}</p>
          </div>
          <button type="button" onClick={hide} aria-label={t("nudge.no")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink">
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={accept} className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-full bg-app-forest px-4 text-[14px] font-extrabold text-white transition hover:brightness-110">
            <Icon name="chat" size={15} /> {t("nudge.yes")}
          </button>
          <button type="button" onClick={hide} className="min-h-[42px] rounded-full border border-app-line bg-white px-4 text-[14px] font-bold text-app-ink hover:border-app-line-strong">
            {t("nudge.no")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            storageSet("localStorage", OFF_KEY, "1");
            hide();
          }}
          className="mt-2 w-full text-center text-[12.5px] font-semibold text-app-ink-soft underline-offset-2 hover:underline"
        >
          {t("nudge.never")}
        </button>
      </div>
    </div>
  );
}
