// Small pictures of each shop page style for the builder's picker (section-schema.ts SHOP_LAYOUT_OPTIONS).
// Pure markup: grey blocks stand for product cards, darker bars for filters and categories.

const card = "block rounded-[3px] bg-app-ink/15";
const dark = "block rounded-full bg-app-ink/45";
const frame = "mb-2 block h-[52px] overflow-hidden rounded-[8px] border border-app-line bg-white p-1.5";

function Cards({ count, cols }: { count: number; cols: number }) {
  return (
    <span className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => <span key={i} className={`${card} h-[15px]`} />)}
    </span>
  );
}

export function ShopLayoutThumb({ value }: { value: string }) {
  switch (value) {
    case "filters":
      return (
        <span aria-hidden className={`${frame} flex gap-1.5`}>
          <span className="grid w-[26%] content-start gap-[4px] border-r border-app-line pr-1">
            <span className={`${dark} h-[3px] w-3/4`} />
            <span className="block h-[3px] w-full rounded-full bg-app-ink/20" />
            <span className="block h-[3px] w-2/3 rounded-full bg-app-ink/20" />
            <span className={`${dark} mt-[2px] h-[3px] w-1/2`} />
            <span className="block h-[3px] w-full rounded-full bg-app-ink/20" />
          </span>
          <Cards count={6} cols={3} />
        </span>
      );
    case "tiles":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[4px]`}>
          <span className="flex gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="block h-[14px] flex-1 rounded-[4px] bg-[#2F66F6]/30" />)}
          </span>
          <Cards count={4} cols={4} />
        </span>
      );
    case "carousels":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[4px]`}>
          {[0, 1].map((row) => (
            <span key={row} className="grid gap-[2px]">
              <span className={`${dark} h-[3px] w-1/3`} />
              <span className="flex gap-[3px] overflow-hidden">
                {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`${card} h-[11px] w-[26%] shrink-0`} />)}
              </span>
            </span>
          ))}
        </span>
      );
    case "chips":
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[4px]`}>
          <span className="flex gap-[3px]">
            <span className="block h-[7px] w-[16%] rounded-full bg-app-ink/60" />
            {[0, 1, 2, 3].map((i) => <span key={i} className="block h-[7px] w-[18%] rounded-full border border-app-ink/30" />)}
          </span>
          <Cards count={8} cols={4} />
        </span>
      );
    default:
      return (
        <span aria-hidden className={`${frame} grid content-start gap-[4px]`}>
          <span className="flex gap-[3px]">
            <span className="block h-[7px] flex-1 rounded-full border border-app-ink/30" />
            <span className="block h-[7px] w-[22%] rounded-full border border-app-ink/30" />
          </span>
          <Cards count={8} cols={4} />
        </span>
      );
  }
}
