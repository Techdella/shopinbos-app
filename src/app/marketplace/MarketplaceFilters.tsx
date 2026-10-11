"use client";

type FilterGroup = {
  l: string;
  name: string;
  opts: string[][];
};

type MarketplaceFiltersProps = {
  groups: FilterGroup[];
  selected: Record<string, string>;
  query?: string;
  /** Other params to carry through (category, supplier...), kept as hidden fields. */
  keep?: Record<string, string | undefined>;
};

export function MarketplaceFilters({ groups, selected, query, keep }: MarketplaceFiltersProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.target.form?.requestSubmit();
  }

  return (
    <form method="GET" action="/marketplace" className="grid gap-5">
      {query ? <input type="hidden" name="q" value={query} /> : null}
      {keep && Object.entries(keep).map(([key, value]) => (value ? <input key={key} type="hidden" name={key} value={value} /> : null))}
      {groups.map((g) => (
        <fieldset key={g.l} className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[14px] font-extrabold">{g.l}</legend>
          <div className="flex flex-wrap gap-2">
            {g.opts.map((o) => {
              const val = o[1] ?? o[0];
              const checked = selected[g.name] === String(val).toLowerCase();
              return (
                <label
                  key={String(val)}
                  className="inline-flex min-h-[40px] cursor-pointer items-center rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold text-app-ink has-[:checked]:border-app-ink has-[:checked]:bg-app-ink has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink/30"
                >
                  <input type="radio" name={g.name} value={val} defaultChecked={checked} onChange={handleChange} className="sr-only" />
                  {o[0]}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <noscript>
        <button type="submit" className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white">Apply filters</button>
      </noscript>
    </form>
  );
}
