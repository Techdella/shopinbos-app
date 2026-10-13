"use client";

// Building blocks for the 2026 app redesign (auth + onboarding). Styling mirrors shared/tokens.ts.

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { DIAL_COUNTRIES, OTP_LENGTH, type DialCountry } from "@shared/phone";

import { cx } from "./cx";
import { Mascot as BrandMascot, type MascotProps, type MascotWho } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";

export { cx };

export function Wordmark({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={tone === "dark" ? "/brand/app/wordmark-dark.png" : "/brand/app/wordmark-light.png"} alt="Shopinbos" className={cx("h-[18px] w-auto", className)} />;
}

/** Rex or Peggy. Wraps the shared <Mascot> in components/brand (moods, animation, reduced motion); `name` and an empty
 * `alt` (decorative) are kept for older call sites. "peggy-wave" is Peggy's wave mood. */
export function Mascot({ name, who, mood, alt, ...props }: AppMascotProps) {
  const mascot: MascotWho = who ?? (name === "rex" ? "rex" : "peggy");
  return <BrandMascot who={mascot} mood={mood ?? (name === "peggy-wave" ? "wave" : "idle")} decorative={alt === ""} alt={alt || undefined} {...props} />;
}
type AppMascotProps = Omit<MascotProps, "who"> & ({ who: MascotWho; name?: never } | { name: "rex" | "peggy" | "peggy-wave"; who?: never });

type ButtonTone = "ink" | "white" | "accent" | "ghost" | "forest";

const toneClass: Record<ButtonTone, string> = {
  ink: "bg-app-ink text-white hover:bg-black",
  white: "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
  accent: "bg-app-accent text-white hover:brightness-95",
  ghost: "bg-transparent text-app-ink hover:bg-black/[0.04]",
  forest: "bg-app-forest text-white hover:brightness-110",
};

export const PillButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: "lg" | "md" | "sm"; busy?: boolean }>(
  function PillButton({ tone = "ink", size = "lg", busy = false, className = "", children, disabled, ...props }, ref) {
    const sizeClass = size === "lg" ? "min-h-[56px] px-6 text-[16px] font-extrabold" : size === "md" ? "min-h-[48px] px-5 text-[15px] font-bold" : "min-h-[38px] px-4 text-[13px] font-bold";
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || busy}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-full transition disabled:cursor-not-allowed disabled:opacity-55",
          sizeClass,
          toneClass[tone],
          className,
        )}
        {...props}
      >
        {busy ? <Spinner /> : children}
      </button>
    );
  },
);

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT("ui");
  label ??= t("back");
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-app-ink shadow-[0_1px_2px_rgba(22,20,31,0.06)] transition hover:bg-app-lilac">
      <Icon name="arrowLeft" size={18} strokeWidth={2.2} />
    </button>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[14px] font-bold text-app-ink">
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink",
        className,
      )}
      {...props}
    />
  );
});

export function PhoneInput({
  country,
  onCountry,
  value,
  onChange,
  id,
  autoFocus,
}: {
  country: DialCountry;
  onCountry: (country: DialCountry) => void;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  const t = useT("ui");
  return (
    <div className="flex gap-2">
      <div className="relative">
        <select
          aria-label={t("countryCode")}
          value={country.code}
          onChange={(event) => onCountry(DIAL_COUNTRIES.find((item) => item.code === event.target.value) ?? country)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {DIAL_COUNTRIES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name} ({item.dial})
            </option>
          ))}
        </select>
        <div className="pointer-events-none grid h-[54px] min-w-[66px] place-items-center rounded-[16px] border border-app-line bg-white px-3 text-[15px] font-bold text-app-ink">{country.dial}</div>
      </div>
      <TextInput
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        placeholder={country.example}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className = "" }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx("flex rounded-full bg-white p-1", className)}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option.value)}
            className={cx("min-h-[42px] flex-1 rounded-full px-4 text-[14px] font-bold transition", on ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type PreviewDevice = "desktop" | "mobile";

/** Computer / phone preview switch: two icon buttons (labelled for screen readers), used by every preview. */
export function DeviceToggle({ value, onChange, className = "", size = "md" }: { value: PreviewDevice; onChange: (value: PreviewDevice) => void; className?: string; size?: "sm" | "md" }) {
  const t = useT("ui");
  return (
    <div role="group" aria-label={t("previewSize")} className={cx("inline-flex shrink-0 gap-1 rounded-full bg-app-canvas p-1", className)}>
      {(["desktop", "mobile"] as const).map((option) => {
        const on = option === value;
        const label = option === "desktop" ? t("computerView") : t("phoneView");
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => onChange(option)}
            className={cx(
              "grid place-items-center rounded-full transition",
              size === "sm" ? "h-8 w-9" : "h-9 w-10",
              on ? "bg-white text-app-ink shadow-[0_1px_3px_rgba(22,20,31,0.14)]" : "text-app-ink-soft hover:text-app-ink",
            )}
          >
            <Icon name={option === "desktop" ? "monitor" : "phone"} size={size === "sm" ? 15 : 16} />
          </button>
        );
      })}
    </div>
  );
}

export function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (value: string) => void; onComplete?: (value: string) => void; disabled?: boolean }) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const t = useT("ui");
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  function setAt(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    // Pasting or autofill can deliver the whole code into one box.
    const next = (value.slice(0, index) + clean).slice(0, OTP_LENGTH);
    onChange(next);
    const focusIndex = Math.min(next.length, OTP_LENGTH - 1);
    inputs.current[focusIndex]?.focus();
    if (next.length === OTP_LENGTH) onComplete?.(next);
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label={t("verificationCode")}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            inputs.current[index] = node;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={t("digit", { n: index + 1 })}
          maxLength={index === 0 ? OTP_LENGTH : 1}
          onChange={(event) => setAt(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit && index > 0) inputs.current[index - 1]?.focus();
          }}
          className={cx(
            "h-[64px] w-full min-w-0 max-w-[56px] rounded-[16px] border bg-white text-center text-[24px] font-extrabold text-app-ink outline-none transition focus:border-app-ink",
            digit ? "border-app-line-strong" : "border-app-line",
          )}
        />
      ))}
    </div>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  const style = tone === "error" ? "bg-app-danger-tint text-app-danger" : tone === "success" ? "bg-app-success-tint text-app-success" : "bg-app-mint text-app-forest";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-[16px] px-4 py-3 text-[14px] font-medium leading-6", style)}>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("relative h-[30px] w-[52px] shrink-0 rounded-full transition", on ? "bg-app-ink" : "bg-app-toggle-off")}
    >
      <span className={cx("absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow transition-all", on ? "left-[25px]" : "left-[3px]")} />
    </button>
  );
}

export function ProgressBars({ total, current }: { total: number; current: number }) {
  const t = useT("ui");
  return (
    <div className="flex flex-1 gap-1.5" aria-label={t("stepOf", { n: current + 1, total })}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cx("h-[5px] flex-1 rounded-full transition", index <= current ? "bg-app-ink" : "bg-app-track")} />
      ))}
    </div>
  );
}

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function QrIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3" />
    </svg>
  );
}
