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
};

export function MarketplaceFilters({ groups, selected, query }: MarketplaceFiltersProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.target.form?.requestSubmit();
  }

  return (
    <form method="GET" action="/marketplace">
      {query ? <input type="hidden" name="q" value={query} /> : null}
      {groups.map((g) => (
        <div key={g.l} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 7 }}>{g.l}</div>
          {g.opts.map((o) => {
            const val = o[1] ?? o[0];
            const checked = selected[g.name] === String(val).toLowerCase();
            return (
              <label key={String(val)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", fontSize: 12.5, cursor: "pointer" }}>
                <input type="radio" name={g.name} value={val} defaultChecked={checked} onChange={handleChange} style={{ accentColor: "var(--teal-700)" }} />
                <span style={{ flex: 1 }}>{o[0]}</span>
              </label>
            );
          })}
        </div>
      ))}
      <noscript>
        <button type="submit" className="dbtn dBtn-mint dBtn-sm" style={{ width: "100%", marginTop: 8 }}>Apply filters</button>
      </noscript>
    </form>
  );
}
