"use client";

import { useState } from "react";
import { Mascot, cx } from "@/components/app-ui";

// Rex's tip on the Domain page: where each common registrar keeps its DNS records.
const GUIDES: Array<{ id: string; name: string; steps: string[] }> = [
  { id: "whogohost", name: "Whogohost", steps: ["Log in to your Whogohost client area.", "Open Domains, then My Domains, and pick your domain.", "Choose Manage DNS (DNS Management) and add the records Shopinbos shows you."] },
  { id: "qservers", name: "Qservers", steps: ["Log in to your Qservers client area.", "Open Domains, then My Domains, and choose Manage on your domain.", "Open DNS Management and add each record."] },
  { id: "godaddy", name: "GoDaddy", steps: ["Sign in and open My Products.", "Next to your domain, choose DNS (Manage DNS).", "Choose Add New Record for each record. Delete an old record with the same name if GoDaddy says it already exists."] },
  { id: "namecheap", name: "Namecheap", steps: ["Open Domain List and choose Manage next to your domain.", "Open the Advanced DNS tab.", "Choose Add New Record for each record, then the green tick to save."] },
  { id: "cloudflare", name: "Cloudflare", steps: ["Open your domain and go to DNS, then Records.", "Choose Add record for each one.", "Set Proxy status to DNS only (grey cloud) so the secure certificate can be issued."] },
];

export function RegistrarTip() {
  const [open, setOpen] = useState<string | null>(null);
  const guide = GUIDES.find((entry) => entry.id === open);

  return (
    <div className="flex items-start gap-3">
      <Mascot name="rex" className="h-10 w-10 shrink-0" alt="Rex" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14.5px] leading-[1.5]">
          Bought your domain from Whogohost, Qservers or GoDaddy? Pick it and I&apos;ll show you where to add the records.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Where did you buy your domain?">
          {GUIDES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={open === entry.id}
              onClick={() => setOpen(open === entry.id ? null : entry.id)}
              className={cx(
                "inline-flex min-h-[38px] items-center rounded-full border px-3.5 text-[13px] font-bold transition",
                open === entry.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
              )}
            >
              {entry.name}
            </button>
          ))}
        </div>
        {guide && (
          <ol className="mb-0 mt-3 grid gap-1.5 rounded-[18px] bg-app-peach py-3 pl-8 pr-4 text-[14px] leading-[1.5]" aria-live="polite">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
