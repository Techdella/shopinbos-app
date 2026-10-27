import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/app-ui";
import { AVAILABILITY, AVAILABILITY_LABELS, DEVICES, DEVICE_LABELS, PILOT_ROLE_NAME, PilotReply, deadlineText, pilotIsClosed, type PilotRole } from "@/lib/pilot/pure";
import { verifyPilotToken } from "@/lib/pilot/tokens";
import { PilotNotReady, applicantForReply, declineReply, saveReply, type ReplyOutcome } from "@/lib/pilot/service.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test Shopinbos before launch", robots: { index: false } };

// /pilot/<token>: the personal link in a pilot invitation. The person confirms their email and tells us a little
// about their business; they can change it or say they can't take part until replies close.

type Search = { done?: string; declined?: string; error?: string };

const field = "min-h-[46px] w-full rounded-[14px] border border-[#0E2A38]/[0.14] bg-white px-3.5 text-[15px] text-[#0E2A38] outline-none focus:border-[#0E2A38]";
const label = "flex flex-col gap-1.5 text-[14px] font-semibold";

function outcomeUrl(token: string, outcome: ReplyOutcome, ok: string) {
  if (outcome === "saved") return `/pilot/${token}?${ok}=1`;
  return `/pilot/${token}?error=${outcome}`;
}

async function submit(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const applicantId = verifyPilotToken(token);
  if (!applicantId) redirect(`/pilot/${encodeURIComponent(token)}`);
  const parsed = PilotReply.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    businessType: formData.get("businessType"),
    devices: formData.getAll("devices").map(String),
    availability: formData.get("availability") ?? undefined,
    note: formData.get("note"),
  });
  if (!parsed.success) redirect(`/pilot/${token}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  redirect(outcomeUrl(token, await saveReply(applicantId, parsed.data), "done"));
}

async function decline(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const applicantId = verifyPilotToken(token);
  if (!applicantId) redirect(`/pilot/${encodeURIComponent(token)}`);
  redirect(outcomeUrl(token, await declineReply(applicantId), "declined"));
}

const ERRORS: Record<string, string> = {
  closed: "Replies for this pilot have closed.",
  decided: "We've already picked the testers, so your reply can't be changed now.",
  missing: "We couldn't find your invitation.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="dot-grid-light min-h-[100dvh] bg-[#F4F1EA] px-4 pb-12 pt-6 font-app text-[#0E2A38] sm:pt-8">
      <div className="mx-auto w-full max-w-[640px]">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Shopinbos" className="inline-flex"><Wordmark /></Link>
        </header>
        <div className="mt-8 rounded-[20px] border border-[#0E2A38]/[0.07] bg-white p-5 sm:p-7">{children}</div>
      </div>
    </main>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="m-0 text-[26px] font-bold leading-[1.15] tracking-[-0.02em]">{title}</h1>
      <p className="mb-0 mt-3 text-[15px] leading-[1.6] text-[#0E2A38]/70">{children}</p>
    </Shell>
  );
}

export default async function PilotReplyPage(props: { params: Promise<{ token: string }>; searchParams?: Promise<Search> }) {
  const { token } = await props.params;
  const search = (await props.searchParams) ?? {};
  const applicantId = verifyPilotToken(decodeURIComponent(token));
  if (!applicantId) return <Message title="This link isn't valid">It may have been cut short. Open the link from the message we sent you again, or reply to that message.</Message>;

  let applicant: Awaited<ReturnType<typeof applicantForReply>>;
  try {
    applicant = await applicantForReply(applicantId);
  } catch (error) {
    if (error instanceof PilotNotReady) return <Message title="Not open yet">Please try the link again later.</Message>;
    throw error;
  }
  if (!applicant) return <Message title="Invitation not found">Reply to the message we sent you and we&apos;ll sort it out.</Message>;

  const closed = pilotIsClosed(applicant.program);
  const deadline = deadlineText(applicant.program.closesAt);
  const role = PILOT_ROLE_NAME[applicant.role as PilotRole] ?? "seller";

  if (search.done) {
    return (
      <Message title="Thank you, you're on the list">
        We pick testers after replies close on {deadline}, and we&apos;ll email {applicant.email ?? "you"} either way. You can change your answers with this same link until then.
      </Message>
    );
  }
  if (search.declined) return <Message title="No problem">Thanks for letting us know. We&apos;ll still tell you when Shopinbos opens to everyone.</Message>;
  if (applicant.status === "selected" || applicant.status === "waitlisted") {
    return <Message title="Thanks for replying">{applicant.notifiedAt ? `We've emailed ${applicant.email ?? "you"} with the next steps.` : "We're picking testers now and will email you very soon."}</Message>;
  }
  if (closed) {
    return (
      <Message title="Replies have closed">
        {applicant.status === "applied" ? `We have your reply and will email ${applicant.email ?? "you"} with the outcome soon.` : "Thanks for your interest. We'll let you know when Shopinbos opens to everyone, and when the next pilot wave starts."}
      </Message>
    );
  }

  const error = search.error ? ERRORS[search.error] ?? search.error : null;
  const replied = applicant.status === "applied";

  return (
    <Shell>
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#2E7E78]">Shopinbos pilot</p>
      <h1 className="mb-0 mt-2 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[30px]">Test Shopinbos before launch</h1>
      <p className="mb-0 mt-3 text-[15px] leading-[1.6] text-[#0E2A38]/70">
        We&apos;re picking a small group of {role}s to use the app for two weeks and tell us what works. Reply by <b className="text-[#0E2A38]">{deadline}</b> (Lagos time). We pick from the people who reply in time, and everyone else goes to the next wave.
      </p>
      {replied && <p className="mb-0 mt-4 rounded-[14px] bg-[#EEF7F5] px-4 py-3 text-[14px]">We have your reply. Change anything below and save again.</p>}
      {error && <p role="alert" className="mb-0 mt-4 rounded-[14px] border border-[#E86A4F]/40 bg-[#FDF0EC] px-4 py-3 text-[14px]">{error}</p>}

      <form action={submit} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Your name<input name="name" required maxLength={120} defaultValue={applicant.name ?? ""} className={field} autoComplete="name" /></label>
          <label className={label}>Email for your login<input name="email" type="email" required maxLength={190} defaultValue={applicant.email ?? ""} className={field} autoComplete="email" /></label>
          <label className={label}>WhatsApp number<input name="phone" maxLength={32} defaultValue={applicant.phone ?? ""} className={field} autoComplete="tel" /></label>
          <label className={label}>City or state<input name="city" required maxLength={120} defaultValue={applicant.city ?? ""} className={field} placeholder="e.g. Lagos" /></label>
          <label className={label}>Business name<input name="businessName" maxLength={160} defaultValue={applicant.businessName ?? ""} className={field} /></label>
          <label className={label}>What do you {applicant.role === "delivery" ? "deliver" : applicant.role === "supplier" ? "supply" : "sell"}?<input name="businessType" maxLength={300} defaultValue={applicant.businessType ?? ""} className={field} placeholder={applicant.role === "delivery" ? "e.g. bikes in Lagos mainland" : "e.g. fabrics, skincare"} /></label>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[14px] font-semibold">What will you test on?</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DEVICES.map((d) => (
              <label key={d} className="flex items-center gap-2 text-[14.5px]">
                <input type="checkbox" name="devices" value={d} defaultChecked={applicant.devices.includes(d)} className="h-[18px] w-[18px]" />
                {DEVICE_LABELS[d]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[14px] font-semibold">How much time can you give?</legend>
          <div className="flex flex-col gap-2">
            {AVAILABILITY.map((a) => (
              <label key={a} className="flex items-center gap-2 text-[14.5px]">
                <input type="radio" name="availability" value={a} required defaultChecked={applicant.availability === a} className="h-[18px] w-[18px]" />
                {AVAILABILITY_LABELS[a]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={label}>Anything else we should know? (optional)<textarea name="note" maxLength={1000} rows={3} defaultValue={applicant.note ?? ""} className={`${field} py-2.5`} /></label>

        <p className="m-0 text-[13px] text-[#0E2A38]/60">We only use these details for the pilot: to pick testers, send your login and ask for feedback.</p>
        <button type="submit" className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#0E2A38] px-6 text-[15px] font-bold text-white hover:bg-black">
          {replied ? "Save my reply" : "Count me in"}
        </button>
      </form>

      {applicant.status !== "declined" && (
        <form action={decline} className="mt-4 text-center">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="border-0 bg-transparent text-[13.5px] font-semibold text-[#0E2A38]/60 underline underline-offset-2">I can&apos;t take part this time</button>
        </form>
      )}
    </Shell>
  );
}
