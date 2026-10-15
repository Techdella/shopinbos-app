// Small pictures of each FAQ style for the builder's style picker (FAQ section and product page settings).
// Pure markup: grey bars stand for questions and answers, so each style is recognisable at a glance.

import type React from "react";

const bar = "block h-[3px] rounded-full bg-app-ink/45";
const soft = "block h-[3px] rounded-full bg-app-ink/20";

function Row({ open, mark }: { open?: boolean; mark: React.ReactNode }) {
  return (
    <span className="block">
      <span className="flex items-center gap-1">
        <span className={`${bar} flex-1`} />
        <span className="text-[8px] font-bold leading-none text-app-ink/60">{mark}</span>
      </span>
      {open ? <span className={`${soft} mt-[3px] w-4/5`} /> : null}
    </span>
  );
}

export function FaqStyleThumb({ value }: { value: string }) {
  const frame = "mb-2 block h-[46px] overflow-hidden rounded-[8px] border border-app-line bg-white p-1.5";
  switch (value) {
    case "plus":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[5px]`}>
          <Row mark="−" open />
          <Row mark="+" />
          <Row mark="+" />
        </span>
      );
    case "chevron":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[5px]`}>
          <Row mark="⌃" open />
          <Row mark="⌄" />
          <Row mark="⌄" />
        </span>
      );
    case "cards":
      return (
        <span aria-hidden className={`${frame} grid grid-cols-2 gap-1`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="grid content-start gap-[2px] rounded-[4px] bg-app-canvas p-1">
              <span className={bar} />
              <span className={`${soft} w-3/4`} />
            </span>
          ))}
        </span>
      );
    case "numbered":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[4px]`}>
          {["1", "2", "3"].map((n) => (
            <span key={n} className="flex items-center gap-1 border-b border-app-line pb-[3px] last:border-b-0">
              <span className="text-[7px] font-bold leading-none text-[#2F66F6]">{n}</span>
              <span className={`${bar} flex-1`} />
            </span>
          ))}
        </span>
      );
    case "split":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[6px]`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="grid grid-cols-[2fr_3fr] gap-1.5">
              <span className={bar} />
              <span className={soft} />
            </span>
          ))}
        </span>
      );
    case "boxed":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[3px]`}>
          {[0, 1].map((i) => (
            <span key={i} className="flex items-center gap-1 rounded-[4px] bg-app-canvas px-1 py-[3px]">
              <span className="grid h-[9px] w-[9px] place-items-center rounded-full bg-[#2F66F6] text-[6px] font-bold leading-none text-white">?</span>
              <span className={`${bar} flex-1`} />
            </span>
          ))}
        </span>
      );
    default:
      // "Same as my FAQ section" / "Template style": a link to another place.
      return (
        <span aria-hidden className={`${frame} grid place-items-center text-[16px] leading-none text-app-ink/50`}>↺</span>
      );
  }
}
