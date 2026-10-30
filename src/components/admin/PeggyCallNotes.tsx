import { peggyNotes } from "@/lib/onboarding/peggy-notes.server";

// "Peggy call notes (English)" on the admin seller, supplier and delivery-partner pages (and so next to their
// verification): what Peggy noted on "Call Peggy" calls and the summary of each call, newest first. Always in
// English, whatever language the call was in. Hidden when there are none.

const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

export async function PeggyCallNotes({ userId }: { userId: string }) {
  const notes = await peggyNotes(userId);
  if (!notes.length) return null;
  return (
    <section aria-labelledby="peggy-call-notes" className="mb-5 rounded-[18px] border border-app-line bg-white p-5">
      <h2 id="peggy-call-notes" className="m-0 text-[17px] font-extrabold">Peggy notes (English)</h2>
      <p className="m-0 mt-1 text-[14px] text-app-ink-soft">What Peggy noted on calls with them, and her summary of each call. Translated to English when the call was in Pidgin.</p>
      <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0 text-[14.5px]">
        {notes.map((note) => (
          <li key={note.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-app-ink-soft">
              <span>{when(note.createdAt)}</span>
              <span className="rounded-full bg-app-canvas px-2 py-0.5">{note.kind === "summary" ? (note.via === "elevenlabs" ? "Call summary (ElevenLabs)" : "Call summary") : note.via === "chat" ? "Note from Ask Peggy" : "Note"}</span>
            </div>
            <p className="m-0 mt-1 whitespace-pre-wrap break-words">{note.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
