"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState, useTransition, type ReactNode } from "react";
import { FieldLabel, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { addWebhookAction, createApiKeyAction, removeWebhookAction, revokeApiKeyAction, rotateApiKeyAction, sendTestWebhookAction } from "@/app/actions/partner-api";

// Admin › Developers: API keys and webhooks for a partner's own dispatch software (the partner portal only has a
// "Connect your system" request form). Secrets are shown once, right after they're made.

export interface KeyRow { id: string; name: string; prefix: string; created: string; lastUsed: string | null; revoked: boolean }
export interface HookRow { id: string; url: string; events: string[]; active: boolean; lastStatus: number | null; lastDelivered: string | null }

const EVENTS = [
  { id: "job.offered", label: "job.offered", hint: "A seller books you" },
  { id: "job.updated", label: "job.updated", hint: "A job changes status" },
  { id: "job.cancelled", label: "job.cancelled", hint: "A job is cancelled" },
  { id: "cod.reminder", label: "cod.reminder", hint: "Cash is due to be paid in" },
];

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
      <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
      <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{sub}</p>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function Badge({ tone, children }: { tone: "success" | "muted" | "danger"; children: ReactNode }) {
  const style = tone === "success" ? "bg-app-success-tint text-app-success" : tone === "danger" ? "bg-app-danger-tint text-app-danger" : "bg-app-canvas text-app-ink-soft";
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold", style)}>{children}</span>;
}

function ShownOnce({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-[16px] bg-app-mint p-4">
      <p className="m-0 text-[14px] font-bold text-app-forest">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-[12px] bg-white px-3 py-2 font-mono text-[13px]">{value}</code>
        <PillButton
          size="sm"
          tone="ink"
          className="min-h-[40px]"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
        </PillButton>
        <PillButton size="sm" tone="white" className="min-h-[40px]" onClick={onDone}>Done</PillButton>
      </div>
      <p className="mb-0 mt-2 text-[13px] text-app-forest">Store it somewhere safe now. We only keep a fingerprint, so we can&apos;t show it again.</p>
    </div>
  );
}

export function ApiKeysPanel({ partnerId, keys, canCreate }: { partnerId: string; keys: KeyRow[]; canCreate: boolean }) {
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const create = () =>
    start(async () => {
      setError(null);
      const result = await createApiKeyAction(partnerId, name);
      if (result.ok) {
        setNewKey(result.key);
        setName("");
      } else setError(result.error);
    });

  const revoke = async (id: string) => {
    if (!(await confirmDialog("Revoke this key? Anything using it stops working straight away."))) return;
    setBusyId(id);
    start(async () => {
      const result = await revokeApiKeyAction(partnerId, id);
      if (!result.ok) setError(result.error);
      setBusyId(null);
    });
  };

  const rotate = async (id: string) => {
    if (!(await confirmDialog("Rotate this key? We make a new key now and the old one stops working straight away."))) return;
    setBusyId(`rotate:${id}`);
    start(async () => {
      setError(null);
      const result = await rotateApiKeyAction(partnerId, id);
      if (result.ok) setNewKey(result.key);
      else setError(result.error);
      setBusyId(null);
    });
  };

  return (
    <Section title="API keys" sub="Their dispatch system sends one of these on every call: Authorization: Bearer sbp_live_…. Copy it to the partner securely.">
      {error && <Notice tone="error">{error}</Notice>}
      {newKey && <ShownOnce label="New API key (shown once)" value={newKey} onDone={() => setNewKey(null)} />}

      {canCreate ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <div className="min-w-[200px] flex-1">
            <FieldLabel htmlFor="key-name">Key name</FieldLabel>
            <TextInput id="key-name" value={name} maxLength={60} placeholder="e.g. Dispatch server" onChange={(event) => setName(event.target.value)} className="h-[48px]" />
          </div>
          <PillButton type="submit" size="md" tone="ink" busy={pending && !busyId}>Create key</PillButton>
        </form>
      ) : (
        <Notice tone="info">Keys work once the partner is verified. Approve their verification above first.</Notice>
      )}

      {keys.length === 0 ? (
        <p className="m-0 text-[14px] text-app-ink-soft">No keys yet.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-app-line rounded-[16px] border border-app-line p-0">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14.5px] font-bold">{key.name}</span>
                  <Badge tone={key.revoked ? "danger" : "success"}>{key.revoked ? "Revoked" : "Active"}</Badge>
                </div>
                <div className="mt-0.5 text-[13px] text-app-ink-soft">
                  <code className="font-mono">{key.prefix}…</code> · Created {key.created} · {key.lastUsed ? `Last used ${key.lastUsed}` : "Never used"}
                </div>
              </div>
              {!key.revoked && (
                <div className="flex gap-2">
                  {canCreate && (
                    <PillButton size="sm" tone="white" className="min-h-[40px]" busy={busyId === `rotate:${key.id}`} onClick={() => rotate(key.id)} aria-label={`Rotate ${key.name}`}>
                      Rotate
                    </PillButton>
                  )}
                  <PillButton size="sm" tone="white" className="min-h-[40px]" busy={busyId === key.id} onClick={() => revoke(key.id)} aria-label={`Revoke ${key.name}`}>
                    Revoke
                  </PillButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function WebhooksPanel({ partnerId, hooks }: { partnerId: string; hooks: HookRow[] }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(EVENTS.map((event) => event.id));
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      setError(null);
      const result = await addWebhookAction(partnerId, { url, events });
      if (result.ok) {
        setSecret(result.secret);
        setUrl("");
      } else setError(result.error);
    });

  const run = (id: string, work: () => Promise<void>) => {
    setBusyId(id);
    start(async () => {
      await work();
      setBusyId(null);
    });
  };

  const test = (id: string) =>
    run(`test:${id}`, async () => {
      const result = await sendTestWebhookAction(partnerId, id);
      setTests((current) => ({
        ...current,
        [id]: !result.ok ? result.error : result.delivered ? `Delivered (HTTP ${result.status})` : result.status ? `Their endpoint answered HTTP ${result.status}` : "No answer within 5 seconds",
      }));
    });

  const remove = async (id: string) => {
    if (!(await confirmDialog("Remove this webhook? We'll stop sending events to it."))) return;
    run(`remove:${id}`, async () => {
      const result = await removeWebhookAction(partnerId, id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <Section title="Webhooks" sub="We POST events to the partner's https address, signed with the webhook's secret.">
      {error && <Notice tone="error">{error}</Notice>}
      {secret && <ShownOnce label="Signing secret for your new webhook" value={secret} onDone={() => setSecret(null)} />}

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <div>
          <FieldLabel htmlFor="hook-url">Webhook address</FieldLabel>
          <TextInput id="hook-url" type="url" inputMode="url" required pattern="https://.*" value={url} placeholder="https://dispatch.example.com/shopinbos" onChange={(event) => setUrl(event.target.value)} className="h-[48px]" />
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 text-[14px] font-bold">Events to send</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {EVENTS.map((event) => {
              const checked = events.includes(event.id);
              return (
                <label key={event.id} className={cx("flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-2", checked ? "border-app-ink" : "border-app-line")}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#16141F]"
                    checked={checked}
                    onChange={() => setEvents((current) => (checked ? current.filter((id) => id !== event.id) : [...current, event.id]))}
                  />
                  <span className="min-w-0">
                    <code className="block font-mono text-[13px] font-bold">{event.label}</code>
                    <span className="block text-[12.5px] text-app-ink-soft">{event.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <PillButton type="submit" size="md" tone="ink" busy={pending && !busyId} disabled={!url || events.length === 0}>Add webhook</PillButton>
        </div>
      </form>

      {hooks.length === 0 ? (
        <p className="m-0 text-[14px] text-app-ink-soft">No webhooks yet.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-app-line rounded-[16px] border border-app-line p-0">
          {hooks.map((hook) => {
            const delivered = hook.lastStatus !== null && hook.lastStatus >= 200 && hook.lastStatus < 300;
            return (
              <li key={hook.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-[13px] font-bold">{hook.url}</code>
                  {hook.lastStatus !== null && (
                    <Badge tone={delivered ? "success" : "danger"}>{delivered ? "Last delivery OK" : hook.lastStatus ? `Last answer HTTP ${hook.lastStatus}` : "Last delivery failed"}</Badge>
                  )}
                </div>
                <div className="text-[13px] text-app-ink-soft">
                  {hook.events.length ? hook.events.join(", ") : "All events"} · {hook.lastDelivered ? `Last delivered ${hook.lastDelivered}` : "Nothing delivered yet"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PillButton size="sm" tone="white" className="min-h-[40px]" busy={busyId === `test:${hook.id}`} onClick={() => test(hook.id)}>Send test event</PillButton>
                  <PillButton size="sm" tone="ghost" className="min-h-[40px]" busy={busyId === `remove:${hook.id}`} onClick={() => remove(hook.id)} aria-label={`Remove webhook ${hook.url}`}>
                    <Icon name="trash" size={14} /> Remove
                  </PillButton>
                  {tests[hook.id] && <span role="status" className="text-[13px] font-semibold">{tests[hook.id]}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
