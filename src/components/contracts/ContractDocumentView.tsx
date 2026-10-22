import type { ContractDocument } from "@shared/contracts";

// The contract as both sides read and sign it (shared/contracts.ts). No hooks, so it renders on the server (each
// side's copy, the admin's opened copy) and in the browser (the preview before the shop signs). English only: the
// document is the binding text. Prints cleanly (window.print / save as PDF).

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

export function ContractDocumentView({ doc, reference, compact = false }: { doc: ContractDocument; reference?: string; compact?: boolean }) {
  return (
    <article lang="en" className={`contract-document grid gap-4 text-[14px] leading-[1.6] text-app-ink ${compact ? "" : "rounded-[18px] border border-app-line bg-white p-5 sm:p-8"}`}>
      <header className="grid gap-1 border-b border-app-line pb-4">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Shopinbos · {reference ?? "Draft"} · version {doc.version}</p>
        <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.4px]">{doc.title}</h2>
        <p className="m-0 text-[13.5px] text-app-ink-soft">Dated {longDate(doc.date)}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        {[doc.partyA, doc.partyB].map((party) => (
          <div key={party.label} className="rounded-[14px] bg-app-canvas p-3">
            <p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-app-ink-soft">{party.label.replace(/^the /, "The ")}</p>
            <p className="m-0 text-[15px] font-extrabold">{party.name}</p>
            {party.details.map((line) => <p key={line} className="m-0 text-[13px] text-app-ink-soft">{line}</p>)}
          </div>
        ))}
      </section>
      <ol className="m-0 grid list-none gap-4 p-0">
        {doc.sections.map((section, index) => (
          <li key={section.heading} className="grid gap-1.5">
            <h3 className="m-0 text-[15px] font-extrabold">{index + 1}. {section.heading}</h3>
            {section.paragraphs.map((paragraph, at) => <p key={at} className="m-0">{paragraph}</p>)}
          </li>
        ))}
      </ol>
    </article>
  );
}
