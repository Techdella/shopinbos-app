import type { ReactNode } from "react";

interface PageHeadProps {
  title: string;
  sub?: string;
  actions?: ReactNode;
  crumbs?: string[];
}

export function PageHead({ title, sub, actions, crumbs }: PageHeadProps) {
  return (
    <div className="pg-hero">
      <div>
        {crumbs && (
          <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>
            {crumbs.map((c, i) => (
              <span key={i}>{i > 0 && <span style={{ margin: "0 4px", color: "var(--ink-300)" }}>/</span>}{c}</span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <div className="pg-sub">{sub}</div>}
      </div>
      {actions && <div className="pg-acts">{actions}</div>}
    </div>
  );
}
