// Class names for plain (server-rendered) form fields in the 2026 app look,
// matching TextInput / FieldLabel from "@/components/app-ui".

export const FIELD_LABEL = "mb-2 block text-[14px] font-bold text-app-ink";
export const FIELD_HELP = "mb-0 mt-1.5 text-[12.5px] leading-[1.5] text-app-ink-soft";
export const FIELD_INPUT =
  "h-[50px] w-full min-w-0 rounded-[16px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const FIELD_TEXTAREA =
  "w-full min-w-0 resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const FIELD_SELECT =
  "h-[50px] w-full min-w-0 rounded-[16px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none transition focus:border-app-ink";
export const CHECKBOX = "h-5 w-5 shrink-0 accent-[#16141F]";

const PILL_BASE = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-[14px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-55";
export const SUBMIT_ACCENT = `${PILL_BASE} bg-app-accent text-white hover:brightness-95`;
export const SUBMIT_INK = `${PILL_BASE} bg-app-ink text-white hover:bg-black`;
export const SUBMIT_WHITE = `${PILL_BASE} border border-app-line bg-white text-app-ink hover:border-app-line-strong`;
