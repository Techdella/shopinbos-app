import type { Metadata } from "next";

export const metadata: Metadata = { title: "Delete your data" };

// Meta's "Data Deletion Instructions URL" for the Shopinbos app (developers.facebook.com → App settings → Basic).
// Public on purpose (PUBLIC_ROUTES in src/proxy.ts): Meta's reviewers and people who aren't sellers must reach it.

const PRIVACY_EMAIL = "privacy@shopinbos.com";

export default function DataDeletionPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 16px", background: "var(--paper, #FAF7F1)" }}>
      <div className="card" style={{ maxWidth: 640, margin: "0 auto", padding: 28 }}>
        <p style={{ margin: "0 0 6px", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#195754" }}>Shopinbos</p>
        <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 600 }}>Delete your data</h1>
        <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.6 }}>
          Shopinbos only keeps what it needs to run a shop&apos;s inbox, catalog and ads. Here is how to remove the data that came from
          Facebook, Instagram or WhatsApp.
        </p>

        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>If you run a shop on Shopinbos</h2>
        <ol style={{ margin: "0 0 20px", paddingLeft: 20, fontSize: 15, lineHeight: 1.6 }}>
          <li>Log in and open <a href="/home/inbox/channels" style={{ color: "#195754", fontWeight: 600 }}>Inbox channels</a>.</li>
          <li>Choose <strong>Disconnect</strong> on WhatsApp, Messenger or Instagram. We delete that account&apos;s access tokens and keys straight away.</li>
          <li>
            To also delete your conversations, catalog and account, email <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "#195754", fontWeight: 600 }}>{PRIVACY_EMAIL}</a> from
            the email on your account. We confirm and finish within 30 days.
          </li>
          <li>You can also remove Shopinbos from Facebook: <strong>Settings &amp; privacy → Settings → Business integrations</strong>, then <strong>Remove</strong>.</li>
        </ol>

        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>If you messaged a shop that uses Shopinbos</h2>
        <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.6 }}>
          Ask the shop to delete your conversation, or email <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "#195754", fontWeight: 600 }}>{PRIVACY_EMAIL}</a> with
          the shop&apos;s name and the phone number or Facebook/Instagram name you messaged from. We delete your messages and contact details
          within 30 days and email you when it&apos;s done.
        </p>

        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600, #555)" }}>
          Some records, like paid orders and invoices, are kept as long as the law requires. See our{" "}
          <a href="https://shopinbos.com/legal/privacy/" style={{ color: "#195754" }}>privacy policy</a>.
        </p>
      </div>
    </main>
  );
}
