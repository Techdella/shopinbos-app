import Link from "next/link";
import { Card, EmptyState, ListCard, Pill, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { getT } from "@/lib/i18n/server";
import type { ContractCopy, ContractListRow, unwrittenFor } from "@/lib/contracts/contracts.server";
import { ContractDocumentView } from "./ContractDocumentView";
import { DisputeBox, PrintButton, SignContract, SignWrittenCopy } from "./ContractActions";

// The Contracts pages of the seller, supplier and delivery partner portals: the list, and one side's copy (the
// document, both signatures, the fingerprint, the history including every time the team opened it, and disputes).
// The admin portal shows the same copy once a dispute lets it open one (src/app/admin/contracts).

type T = Awaited<ReturnType<typeof getT<readonly ["contracts"]>>>;
const day = (value: Date | string) => new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const time = (value: Date | string) => new Date(value).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export function statusOf(t: T, row: { status: string; side: "a" | "b" | "admin"; partyAName: string; partyBName: string }): { label: string; tone: Tone } {
  if (row.status === "awaiting") return row.side === "b" ? { label: t("status.waitingYou"), tone: "warning" } : { label: t("status.waitingThem", { name: row.partyBName }), tone: "info" };
  if (row.status === "signed") return { label: t("status.signed"), tone: "success" };
  if (row.status === "ended") return { label: t("status.ended"), tone: "muted" };
  return { label: t("status.declined"), tone: "muted" };
}

export async function ContractList({ rows, base, unwritten }: { rows: ContractListRow[]; base: string; unwritten?: Awaited<ReturnType<typeof unwrittenFor>> }) {
  const t = await getT("contracts");
  const pending = [...(unwritten?.agreements.map((row) => ({ ...row, key: "agreementId" as const, kind: "dropship" })) ?? []), ...(unwritten?.connections.map((row) => ({ ...row, key: "connectionId" as const, kind: "delivery" })) ?? [])];
  return (
    <div className="grid gap-4">
      <Notice tone="info">{t("privacy")}</Notice>
      {pending.length ? (
        <Card className="grid gap-3 p-5">
          <div>
            <h2 className="m-0 text-[15px] font-extrabold">{t("unwritten.title")}</h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("unwritten.sub")}</p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-app-canvas p-3">
                <div className="min-w-0">
                  <div className="text-[14.5px] font-extrabold">{row.name}</div>
                  <div className="text-[13px] text-app-ink-soft">{t.dynamic(`kind.${row.kind}`, row.kind)}{row.since ? ` · ${t("unwritten.since", { date: day(row.since) })}` : ""}</div>
                </div>
                <SignWrittenCopy {...{ [row.key]: row.id }} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {rows.length ? (
        <ListCard>
          {rows.map((row) => {
            const status = statusOf(t, row);
            return (
              <li key={row.id}>
                <Link href={`${base}/${row.id}`} className="flex flex-wrap items-center gap-3 px-4 py-4 text-app-ink no-underline hover:bg-app-canvas sm:px-5">
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-extrabold">{t.dynamic(`kind.${row.kind}`, row.title)}</span>
                      <span className="font-mono text-[11.5px] text-app-ink-soft">{row.reference}</span>
                    </div>
                    <div className="text-[13.5px] text-app-ink-soft">{t("with", { name: row.otherName })} · {t("signedOn", { date: day(row.partyASignedAt) })}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.disputeStatus === "open" ? <Pill tone="danger" dot>{t("disputeOpen")}</Pill> : null}
                    <Pill tone={status.tone} dot>{status.label}</Pill>
                  </div>
                </Link>
              </li>
            );
          })}
        </ListCard>
      ) : !pending.length ? (
        <EmptyState icon="document" title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : null}
    </div>
  );
}

const EVENT_ACTIONS = ["signed", "declined", "ended", "dispute_opened", "dispute_closed", "admin_opened"];

/** One copy of a contract: for a side (with signing and disputes) or for the team (read only). */
export async function ContractCopyView({ copy, back, intact, extra, signHere = true }: { copy: ContractCopy; back?: string; intact: boolean; extra?: React.ReactNode; /** False when the signing happens elsewhere (a supplier accepts a shop's request under Dropship agreements). */ signHere?: boolean }) {
  const t = await getT("contracts");
  const { contract, doc, side, reference } = copy;
  const status = statusOf(t, { ...contract, side });
  const partyName = (which: string) => (which === "a" ? contract.partyAName : which === "b" ? contract.partyBName : "Shopinbos");
  const signatures = [
    { label: doc?.partyA.label ?? "Party A", business: contract.partyAName, name: contract.partyASignedName, at: contract.partyASignedAt },
    { label: doc?.partyB.label ?? "Party B", business: contract.partyBName, name: contract.partyBSignedName, at: contract.partyBSignedAt },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {back ? <Link href={back} className="text-[14px] font-bold text-app-ink no-underline">‹ {t("back")}</Link> : <span />}
        <div className="flex flex-wrap items-center gap-2">
          {contract.disputeStatus === "open" ? <Pill tone="danger" dot>{t("disputeOpen")}</Pill> : null}
          <Pill tone={status.tone} dot>{status.label}</Pill>
          <PrintButton />
        </div>
      </div>
      {contract.disputeStatus === "open" && contract.disputeReason ? <Notice tone="error">{t("dispute.openNote", { reason: contract.disputeReason })}</Notice> : null}
      {contract.disputeStatus === "closed" && contract.disputeClosedNote ? <Notice tone="info">{t("dispute.closedNote", { note: contract.disputeClosedNote })}</Notice> : null}
      {contract.status === "declined" && contract.declineNote ? <Notice tone="info">{`${t("status.declined")}: "${contract.declineNote}"`}</Notice> : null}
      {extra}
      {signHere && side === "b" && contract.status === "awaiting" ? <SignContract contractId={contract.id} canDecline={contract.kind === "delivery"} /> : null}
      {doc ? <ContractDocumentView doc={doc} reference={reference} /> : null}
      <Card className="grid gap-3 p-5">
        <h2 className="m-0 text-[15px] font-extrabold">{t("signatures")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {signatures.map((signature) => (
            <div key={signature.label} className="grid gap-1 rounded-[14px] border border-app-line p-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-app-ink-soft">{signature.label.replace(/^the /, "The ")} · {signature.business}</span>
              {signature.name && signature.at ? (
                <>
                  <span className="font-accent text-[20px] italic">{signature.name}</span>
                  <span className="text-[13px] text-app-ink-soft">{t("signedBy", { name: signature.name, date: time(signature.at) })}</span>
                </>
              ) : (
                <span className="text-[13.5px] text-app-ink-soft">{t("notSigned")}</span>
              )}
            </div>
          ))}
        </div>
        <dl className="m-0 grid gap-1 text-[12.5px] text-app-ink-soft">
          <div><dt className="inline font-bold">{t("reference")}: </dt><dd className="inline font-mono">{reference}</dd> · <dt className="inline font-bold">{t("version")}: </dt><dd className="inline">{contract.version}</dd></div>
          <div className="break-all"><dt className="inline font-bold">{t("fingerprint")}: </dt><dd className="inline font-mono">{contract.bodyHash}</dd></div>
          <div className={intact ? "text-app-success" : "font-bold text-app-danger"}>{intact ? t("intact") : t("changed")}</div>
          <div>{t("englishNote")}</div>
        </dl>
      </Card>
      <Card className="grid gap-2 p-5">
        <h2 className="m-0 text-[15px] font-extrabold">{t("history")}</h2>
        <ol className="m-0 grid list-none gap-2 p-0 text-[13.5px]">
          {contract.events.filter((event) => EVENT_ACTIONS.includes(event.action)).map((event) => (
            <li key={event.id} className="grid gap-0.5 border-l-2 border-app-line pl-3">
              <span className="font-bold">
                {t.dynamic(`event.${event.action}`, event.action, { name: event.actorName ?? partyName(event.actorSide) })}
                {event.action !== "signed" && event.action !== "admin_opened" && event.actorSide !== "system" ? ` · ${partyName(event.actorSide)}` : ""}
              </span>
              {event.note ? <span className="text-app-ink-soft">&ldquo;{event.note}&rdquo;</span> : null}
              <span className="text-[12.5px] text-app-ink-soft">{time(event.createdAt)}</span>
            </li>
          ))}
        </ol>
      </Card>
      {side !== "admin" && (contract.status === "signed" || contract.status === "ended") ? (
        <DisputeBox contractId={contract.id} open={contract.disputeStatus === "open"} canWithdraw={contract.disputeStatus === "open" && contract.disputeOpenedBy === side} />
      ) : null}
    </div>
  );
}
