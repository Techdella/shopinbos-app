import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { unsubscribeCampaignRecipient } from "@/lib/campaigns/send";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
};

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  await unsubscribeCampaignRecipient(token);
  redirect(`/email/unsubscribe/${encodeURIComponent(token)}?done=1`);
}

// Confirmation step, so link scanners that prefetch emails can't unsubscribe people by accident.
export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { done } = await searchParams;
  const recipient = await db.campaignRecipient.findUnique({
    where: { token },
    select: { email: true, campaign: { select: { store: { select: { name: true } } } } },
  });
  if (!recipient) notFound();
  const storeName = recipient.campaign.store.name;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px 16px", background: "var(--paper, #FAF7F1)" }}>
      <div className="card" style={{ maxWidth: 440, width: "100%", padding: 28, textAlign: "center" }}>
        {done ? (
          <>
            <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600 }}>You&apos;re unsubscribed</h1>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-600, #555)" }}>
              {recipient.email} won&apos;t get marketing emails from {storeName} any more. Order updates will still arrive.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600 }}>Unsubscribe from {storeName}?</h1>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--ink-600, #555)" }}>
              {recipient.email} will stop receiving marketing emails from {storeName}.
            </p>
            <form action={unsubscribe}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="dbtn dBtn-mint" style={{ width: "100%" }}>Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
