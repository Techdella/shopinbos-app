"use client";

const LABELS = ["Terrible", "Poor", "Okay", "Good", "Excellent"];

// Five radio buttons styled as stars: keyboard and screen-reader friendly.
export function StarInput({ name, value, onChange, accent = "#E8A23A" }: { name: string; value: number; onChange: (value: number) => void; accent?: string }) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">Rating</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label key={star} className="cursor-pointer p-0.5" title={LABELS[star - 1]}>
            <input type="radio" name={name} value={star} checked={value === star} onChange={() => onChange(star)} className="peer sr-only" />
            <span aria-hidden className="block text-[30px] leading-none transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2" style={{ color: star <= value ? accent : "#D9D5E0" }}>★</span>
            <span className="sr-only">{star} star{star === 1 ? "" : "s"}, {LABELS[star - 1]}</span>
          </label>
        ))}
        <span className="ml-2 text-[13px] opacity-70">{value ? LABELS[value - 1] : "Tap to rate"}</span>
      </div>
    </fieldset>
  );
}
