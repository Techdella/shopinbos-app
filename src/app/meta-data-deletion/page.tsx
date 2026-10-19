import type { Metadata } from "next";
import { deletionRequestStatus } from "@/lib/meta/user-data.server";
import { isConfirmationCode } from "@/lib/meta/signed-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Facebook data deletion | Shopinbos", robots: { index: false } };

// The status URL Meta shows someone who removed Shopinbos from Facebook and asked for their data to be deleted
// (POST /api/webhooks/meta/data-deletion hands it back with the confirmation code). Public: no sign-in.

const STATUS_COPY = {
  received: { label: "In progress", tone: "text-amber", body: "We've received your request and are deleting the data now. This usually takes a few minutes." },
  completed: { label: "Completed", tone: "text-teal", body: "The data Shopinbos received from Facebook about you has been deleted." },
  failed: { label: "Delayed", tone: "text-coral", body: "Something went wrong while deleting. Our team has been alerted and will finish it by hand." },
} as const;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(date);
}

const CONTACT = process.env.SUPPORT_INBOX?.trim() || "support@shopinbos.com";

export default async function MetaDataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: raw } = await searchParams;
  const code = raw?.trim().toUpperCase();
  const request = isConfirmationCode(code) ? await deletionRequestStatus(code).catch(() => null) : null;
  const copy = request ? STATUS_COPY[request.status as keyof typeof STATUS_COPY] ?? STATUS_COPY.received : null;

  return (
    <main className="min-h-screen bg-paper px-4 py-12 text-navy">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal-deep">Shopinbos · Privacy</p>
        <h1 className="mt-2 font-display text-[30px] font-medium tracking-[-0.025em]">Facebook data deletion</h1>

        <section className="mt-6 rounded-lg border border-navy/[0.06] bg-white p-6">
          {request && copy ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Confirmation code</p>
              <p className="mt-1 font-mono text-[18px] tracking-[0.08em]">{code}</p>
              <p className={`mt-5 font-display text-[18px] font-medium ${copy.tone}`}>{copy.label}</p>
              <p className="mt-1 text-[15px] leading-[1.6] text-navy/80">{copy.body}</p>
              <dl className="mt-5 grid gap-1 text-[13px] text-muted">
                <div>
                  <dt className="inline">Requested: </dt>
                  <dd className="inline">{formatDate(request.requestedAt)}</dd>
                </div>
                {request.completedAt && (
                  <div>
                    <dt className="inline">Completed: </dt>
                    <dd className="inline">{formatDate(request.completedAt)}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-[1.6]">
                {code ? "We couldn't find a request with that confirmation code." : "Enter the confirmation code Facebook gave you to see your request."}
              </p>
              <form className="mt-4 flex flex-wrap gap-2" method="get">
                <label htmlFor="code" className="sr-only">Confirmation code</label>
                <input
                  id="code"
                  name="code"
                  defaultValue={code ?? ""}
                  placeholder="e.g. 7KQ2MX9TAB4C"
                  className="h-11 min-w-0 flex-1 rounded-pill border border-navy/15 bg-white px-4 font-mono text-[15px] uppercase tracking-[0.08em]"
                />
                <button type="submit" className="h-11 rounded-pill bg-navy px-5 text-[14px] font-medium text-cream">
                  Check
                </button>
              </form>
            </>
          )}
        </section>

        <section className="mt-6 space-y-3 text-[14px] leading-[1.65] text-navy/80">
          <h2 className="font-display text-[18px] font-medium text-navy">What gets deleted</h2>
          <p>
            When you remove Shopinbos from your Facebook account and ask for your data to be deleted, we disconnect everything you
            connected through Facebook (WhatsApp, Messenger, Instagram, your product catalog and ads) and delete what we received
            from Facebook about it: access keys, and account, Page, business, WhatsApp and catalog IDs and names.
          </p>
          <p>
            Your shop&apos;s own records, such as products, orders and the messages customers sent your shop, belong to your
            business account and stay until you close your Shopinbos account. To close it, or for any question, email{" "}
            <a className="text-teal-deep underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
