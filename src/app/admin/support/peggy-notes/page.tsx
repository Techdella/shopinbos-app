import Link from "next/link";
import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { allPeggyNotes } from "@/lib/onboarding/peggy-notes.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Admin › Support › Peggy notes: what Peggy passed to the team, newest first. Notes she sends from Ask Peggy
// (note_to_team: problems, feature requests, complaints) and notes she saves on calls, with who they're about and
// a link to their admin page. ?summaries=1 adds her end-of-call summaries.

const ROLE: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner" };
const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

export default async function AdminPeggyNotesPage(props: { searchParams?: Promise<{ summaries?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const summaries = (await props.searchParams)?.summaries === "1";
  const notes = await allPeggyNotes({ summaries });
  return (
    <AppPage
      frame={adminFrame(user, "Search support tickets")}
      title="Peggy notes"
      sub="What Peggy passed to the team: problems, feature requests and complaints from her chats, and notes from her calls. Always in English."
      actions={
        <>
          <PillLink href={summaries ? "/admin/support/peggy-notes" : "/admin/support/peggy-notes?summaries=1"} icon="list">{summaries ? "Notes only" : "Show call summaries"}</PillLink>
          <PillLink href="/admin/support" icon="arrowLeft">Queue</PillLink>
        </>
      }
    >
      {notes.length ? (
        <ul className="m-0 list-none divide-y divide-app-line rounded-[18px] border border-app-line bg-white p-0">
          {notes.map((note) => (
            <li key={note.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-app-ink-soft">
                {note.href ? <Link href={note.href} className="text-app-ink underline underline-offset-2">{note.who}</Link> : <span className="text-app-ink">{note.who}</span>}
                <span className="rounded-full bg-app-canvas px-2 py-0.5">{ROLE[note.role] ?? note.role}</span>
                <span className="rounded-full bg-app-canvas px-2 py-0.5">{note.kind === "summary" ? "Call summary" : note.via === "chat" ? "From Ask Peggy" : "From a call"}</span>
                <span>{when(note.createdAt)}</span>
              </div>
              <p className="m-0 mt-1.5 whitespace-pre-wrap break-words text-[14.5px]">{note.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-[18px] border border-app-line bg-white p-6 text-[15px] text-app-ink-soft">No notes from Peggy yet.</p>
      )}
    </AppPage>
  );
}
