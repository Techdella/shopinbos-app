"use client";

import { useState } from "react";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

// "Connect <domain>": opens Entri's window (src/lib/entri/server.ts). The seller logs in to the company they bought
// the domain from and Entri adds the records for them, so no records are ever shown here. `records` are ours (the
// store's or the email's); `onDone(true)` once Entri reports success, then the page checks the domain itself.

export interface EntriRecord {
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
  /** Relative to the domain: "@" for the domain itself, "www", "_shopinbos-verify"… */
  host: string;
  value: string;
  priority?: number | null;
}

interface EntriWindow {
  entri?: { connectDomain: (config: Record<string, unknown>) => void };
}

const SCRIPT = "https://cdn.goentri.com/entri.js";

function loadEntri(): Promise<NonNullable<EntriWindow["entri"]>> {
  const w = window as unknown as EntriWindow;
  if (w.entri) return Promise.resolve(w.entri);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (w.entri ? resolve(w.entri) : reject(new Error("entri")));
    script.onerror = () => reject(new Error("entri"));
    document.body.appendChild(script);
  });
}

export function EntriConnect({ domain, records, label, failedText, onDone }: { domain: string; records: EntriRecord[]; label: string; failedText: string; onDone: (success: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function open() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/app/entri/token", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { data?: { applicationId: string; token: string } } | null;
      if (!res.ok || !json?.data) throw new Error("token");
      const entri = await loadEntri();
      const onClose = (event: Event) => {
        window.removeEventListener("onEntriClose", onClose);
        setBusy(false);
        onDone(Boolean((event as CustomEvent<{ success?: boolean }>).detail?.success));
      };
      window.addEventListener("onEntriClose", onClose);
      entri.connectDomain({
        applicationId: json.data.applicationId,
        token: json.data.token,
        prefilledDomain: domain.replace(/^www\./, ""),
        dnsRecords: records.map((record) => ({
          type: record.type,
          host: record.host || "@",
          value: record.value,
          ttl: 300,
          ...(record.priority != null ? { priority: record.priority } : {}),
        })),
      });
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div className="grid gap-2">
      <div>
        <PillButton size="lg" busy={busy} onClick={() => void open()}>
          <Icon name="link" size={16} /> {label}
        </PillButton>
      </div>
      {failed && <p role="alert" className="m-0 text-[14px] text-app-danger">{failedText}</p>}
    </div>
  );
}
