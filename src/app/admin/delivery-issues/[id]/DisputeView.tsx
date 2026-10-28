import { Card, Pill } from "@/components/app-kit";
import { formatDate } from "@/components/admin/AdminKit";
import { FAULT_LABELS, type FaultEvent, type FaultOutcome, type Party } from "@shared/fault-matrix";
import { DisputeDecision } from "./DisputeDecision";

// The body of the team's dispute page (src/app/admin/delivery-issues/[id]/page.tsx): every photo side by side, the
// outcome the evidence points to, what the chosen outcome means for each party, and the decision. Data in, no queries.

export interface DisputeBodyProps {
  issue: { id: string; message: string | null; photos: string[]; status: string };
  parts: Array<{ partKey: string; partLabel: string; photos: Array<{ label: string; url: string | null; by: string }>; suggested: FaultEvent | null; why: string }>;
  events: Array<{ event: string; label: string; replaceable: boolean }>;
  selected: string;
  remedy: string;
  part: string;
  preview: FaultOutcome | null;
  decided: { event: string; remedy: string; outcome: FaultOutcome; note: string | null; createdAt: string } | null;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function partyName(party: Party, names: Map<string, string>) {
  if (party.role === "seller") return "The shop";
  if (party.role === "supplier") return names.get(`supplier:${party.supplierId}`) ?? "The supplier";
  return "The delivery partner";
}

function Photo({ label, by, url }: { label: string; by: string; url: string | null }) {
  return (
    <figure className="m-0 grid content-start gap-1.5">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="aspect-square w-full rounded-[14px] border border-app-line object-cover" />
        </a>
      ) : (
        <div className="grid aspect-square w-full place-items-center rounded-[14px] border-2 border-dashed border-app-line bg-app-canvas p-2 text-center text-[12.5px] font-bold text-app-danger">No photo</div>
      )}
      <figcaption className="text-[12.5px] leading-tight"><span className="block font-extrabold">{label}</span><span className="text-app-ink-soft">{by}</span></figcaption>
    </figure>
  );
}

export function OutcomeView({ outcome, names }: { outcome: FaultOutcome; names: Map<string, string> }) {
  const rows = [
    { who: "Customer", line: outcome.lines.customer },
    { who: "Supplier", line: outcome.lines.supplier },
    { who: "Shop", line: outcome.lines.seller },
    { who: "Delivery partner", line: outcome.lines.logistics },
  ].filter((row) => row.line);
  return (
    <div className="grid gap-3" data-testid="dispute-outcome">
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.who} className="rounded-[14px] bg-app-canvas p-3 text-[13.5px]">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-app-ink-soft">{row.who}</div>
            <p className="m-0 mt-1">{row.line}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-1.5 text-[13.5px]">
        <div className="flex justify-between gap-3"><span className="text-app-ink-soft">Refund to the customer</span><span className="font-extrabold">{naira(outcome.refundKobo)}</span></div>
        {outcome.refundKobo > 0 ? <div className="flex justify-between gap-3"><span className="text-app-ink-soft">Sent by the shop (the split paid them) · by Shopinbos (its own take)</span><span className="shrink-0">{naira(outcome.refundFromSellerKobo)} · {naira(outcome.refundFromShopinbosKobo)}</span></div> : null}
        {outcome.debts.map((debt, index) => (
          <div key={index} className="flex justify-between gap-3">
            <span className="text-app-ink-soft">{partyName(debt.from, names)} → {partyName(debt.to, names)}{debt.fromDeposit ? " (deposit)" : ""}: {debt.kind.replace(/_/g, " ")}, from their next payments</span>
            <span className="shrink-0 font-bold">{naira(debt.kobo)}</span>
          </div>
        ))}
        {outcome.strikes.length ? <div className="text-app-ink-soft">Strike: {outcome.strikes.map((strike) => strike.kind.replace("_", " ")).join(", ")}</div> : null}
        {outcome.trips.length ? <div className="text-app-ink-soft">Trips: {outcome.trips.map((trip) => `${trip.kind} (${naira(trip.feeKobo)}, paid by ${trip.paidBy})`).join(", ")}</div> : null}
      </div>
    </div>
  );
}

export function DisputeBody({ issue, parts, events, selected, remedy, part, preview, decided }: DisputeBodyProps) {
  const names = new Map(parts.map((row) => [row.partKey, row.partLabel.replace(/'s parcel$/, "")]));
  const replaceable = events.find((row) => row.event === selected)?.replaceable ?? false;
  const suggestedPart = parts.find((row) => row.suggested);
  return (
    <div className="grid gap-4">
      {issue.message ? <Card className="p-4 text-[14.5px]"><span className="font-extrabold">The customer says: </span>{issue.message}</Card> : null}

      {parts.map((row) => (
        <Card key={row.partKey} className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[16px] font-extrabold">{row.partLabel}</h2>
            {row.suggested ? <Pill tone="info">Points to: {FAULT_LABELS[row.suggested]}</Pill> : <Pill tone="muted">Points to: nobody owes</Pill>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="dispute-evidence">
            {row.photos.map((photo) => <Photo key={photo.label} label={photo.label} by={photo.by} url={photo.url} />)}
            {row.suggested || parts.length === 1 ? <Photo label="What the customer got" by="Customer" url={issue.photos[0] ?? null} /> : null}
          </div>
          {issue.photos.length > 1 && (row.suggested || parts.length === 1) ? (
            <div className="flex flex-wrap gap-2">
              {issue.photos.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="The customer's photo" className="h-20 w-20 rounded-[12px] border border-app-line object-cover" /></a>
              ))}
            </div>
          ) : null}
          <p className="m-0 text-[13.5px] text-app-ink-soft">{row.why}</p>
        </Card>
      ))}

      {decided ? (
        <Card className="grid gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">Decided: {FAULT_LABELS[decided.event as FaultEvent] ?? decided.event}{decided.remedy === "replacement" ? " (replacement)" : ""}</h2>
            <Pill tone="success">{formatDate(decided.createdAt)}</Pill>
          </div>
          {decided.note ? <p className="m-0 text-[14px]"><span className="font-bold">Reason: </span>{decided.note}</p> : null}
          <OutcomeView outcome={decided.outcome} names={names} />
        </Card>
      ) : issue.status === "open" ? (
        <Card className="grid gap-4 p-5">
          <div>
            <h2 className="m-0 text-[17px] font-extrabold">Outcome</h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">
              {suggestedPart?.suggested ? `Pre-selected from the evidence: ${FAULT_LABELS[suggestedPart.suggested]}.` : "The evidence points to nobody owing anything."} Change it if the photos say otherwise.
            </p>
          </div>
          {preview ? <OutcomeView outcome={preview} names={names} /> : <p className="m-0 text-[14px]">Nobody owes anything: the report is closed with your reason, and no money moves.</p>}
          <DisputeDecision
            issueId={issue.id}
            events={events.map((row) => ({ event: row.event, label: row.label }))}
            selected={selected}
            remedy={remedy}
            replaceable={replaceable}
            parts={parts.map((row) => ({ key: row.partKey, label: row.partLabel }))}
            part={part}
          />
        </Card>
      ) : (
        <Card className="p-5 text-[14px]">This report was closed without an outcome.</Card>
      )}
    </div>
  );
}
