import type { Metadata } from "next";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Field, adminFrame, buttonClass, fieldClass, formatDate } from "@/components/admin/AdminKit";
import {
  addFeatureTargetAction,
  createFeatureInviteAction,
  deletePilotAreaAction,
  removeFeatureTargetAction,
  saveFeatureSwitchAction,
  savePilotAreaAction,
  setFeatureInviteDisabledAction,
  setFeatureKilledAction,
  setKillAllAction,
} from "@/app/actions/admin-features";
import { adminRoleOf } from "@/lib/admin-team/service.server";
import { isFullAdmin } from "@/lib/admin-team/pure";
import { FeatureSwitchesNotReady, adminFeatureData } from "@/lib/feature-switches.server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { FEATURES, FEATURE_APPS, FEATURE_APP_LABEL, formatPlaceRule, type TargetKind } from "@shared/feature-switches";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pilot features" };

// Admin › Pilot features (shared/feature-switches.ts; actions in src/app/actions/admin-features.ts). Pilot features
// ship in the code but stay off until turned on here for the shops, apps, areas and invite holders taking part. The
// apps ask GET /api/app/features when they open and come back to the front, so changes need no new release.

type Data = Awaited<ReturnType<typeof adminFeatureData>>;
type Switch = Data["switches"][number];

const KIND_LABEL: Record<TargetKind, string> = { store: "Shop", supplier: "Supplier", user: "Person", area: "Area" };

const checkboxClass = "h-[18px] w-[18px] shrink-0 accent-plum";

function statusOf(row: Switch, targets: number, killAll: boolean): { tone: "danger" | "muted" | "success" | "info" | "warning"; text: string } {
  if (killAll) return { tone: "danger", text: "Off: everything killed" };
  if (row.killed) return { tone: "danger", text: "Killed" };
  if (!row.enabled) return { tone: "muted", text: "Off" };
  if (!row.apps.length) return { tone: "warning", text: "On, but no app ticked" };
  if (row.everyone) return { tone: "success", text: "On for everyone" };
  return { tone: targets ? "info" : "warning", text: targets ? `On for ${targets} target${targets === 1 ? "" : "s"} + invites` : "On for invite holders only" };
}

function Notices({ query }: { query: { saved?: string; error?: string } }) {
  if (query.error) return <div role="alert" className="mb-5 rounded-[22px] border border-app-danger bg-white p-4 text-[14px] text-app-danger">{query.error}</div>;
  if (query.saved) return <div role="status" className="mb-5 rounded-[22px] border border-app-line bg-white p-4 text-[14px]">{query.saved}</div>;
  return null;
}

function FeatureCard({ row, data }: { row: Switch; data: Data }) {
  const targets = data.targets.filter((target) => target.featureKey === row.key);
  const status = statusOf(row, targets.length, data.killAll);
  return (
    <Card id={row.key} className="mb-5 scroll-mt-6 p-5">
      <CardHead
        title={
          <span className="flex flex-wrap items-center gap-2">
            {row.name}
            <code className="rounded-md bg-app-canvas px-1.5 py-0.5 font-mono text-[12px] text-plum">{row.key}</code>
            <Pill tone={status.tone} dot>{status.text}</Pill>
          </span>
        }
        sub={row.description}
        action={
          <form action={setFeatureKilledAction}>
            <input type="hidden" name="key" value={row.key} />
            <input type="hidden" name="killed" value={row.killed ? "false" : "true"} />
            <button type="submit" className={buttonClass(row.killed ? "white" : "danger", "sm")}>{row.killed ? "Undo kill switch" : "Kill switch"}</button>
          </form>
        }
      />

      <form action={saveFeatureSwitchAction} className="mt-4 grid gap-4">
        <input type="hidden" name="key" value={row.key} />
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" name="enabled" defaultChecked={row.enabled} className={checkboxClass} /> Master switch on
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="everyone" defaultChecked={row.everyone} className={checkboxClass} /> On for everyone on the ticked apps
          </label>
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 text-[13.5px] font-bold">Apps it may show on, and the oldest version that shows it</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURE_APPS.map((app) => (
              <div key={app} className="flex items-center gap-2 rounded-[14px] border border-app-line px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
                  <input type="checkbox" name={`app_${app}`} defaultChecked={row.apps.includes(app)} className={checkboxClass} />
                  <span className="truncate">{FEATURE_APP_LABEL[app]}</span>
                </label>
                <input
                  name={`min_${app}`}
                  defaultValue={row.minVersions[app] ?? ""}
                  placeholder={app === "business_web" ? "—" : "min e.g. 1.0.3"}
                  aria-label={`Minimum version for ${FEATURE_APP_LABEL[app]}`}
                  maxLength={20}
                  className="min-h-[36px] w-[110px] rounded-[10px] border border-app-line px-2 font-mono text-[13px]"
                />
              </div>
            ))}
          </div>
          <p className="mb-0 mt-1.5 text-[12.5px] text-app-ink-soft">No app ticked: it shows nowhere. An app older than the minimum never shows it, even when it&apos;s on. The web has no version: leave its minimum empty.</p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass("ink", "sm")}>Save {row.name}</button>
          <span className="text-[12.5px] text-app-ink-soft">{row.updatedAt ? `Last changed ${formatDate(row.updatedAt)}` : ""}</span>
        </div>
      </form>

      <div className="mt-5 border-t border-app-line pt-4">
        <h3 className="m-0 mb-2 text-[14.5px] font-extrabold">On for</h3>
        {targets.length ? (
          <ul className="m-0 mb-3 flex list-none flex-wrap gap-2 p-0">
            {targets.map((target) => (
              <li key={target.id} className="flex items-center gap-1.5 rounded-full border border-app-line bg-white py-1 pl-3 pr-1 text-[13px]">
                <span className="font-bold text-plum">{KIND_LABEL[target.kind as TargetKind] ?? target.kind}</span>
                <span>{target.kind === "area" ? (data.areas.find((area) => area.id === target.value)?.name ?? target.label ?? target.value) : (target.label ?? target.value)}</span>
                <form action={removeFeatureTargetAction}>
                  <input type="hidden" name="id" value={target.id} />
                  <button type="submit" aria-label={`Remove ${target.label ?? target.value}`} className="grid h-7 w-7 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-danger">×</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mb-3 text-[13px] text-app-ink-soft">No shops, suppliers, people or areas yet{row.everyone ? " (it's on for everyone anyway)" : ""}.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <form action={addFeatureTargetAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="key" value={row.key} />
            <select name="kind" aria-label="Turn it on for" defaultValue="store" className={`${fieldClass} w-auto`}>
              <option value="store">Shop (slug or name)</option>
              <option value="supplier">Supplier (slug or name)</option>
              <option value="user">Person (email)</option>
            </select>
            <input name="query" aria-label="Slug, name or email" placeholder="yourshop or yourshop.mybos.store" maxLength={200} className={`${fieldClass} w-[240px]`} />
            <button type="submit" className={buttonClass("white", "sm")}>Add</button>
          </form>
          {data.areas.length ? (
            <form action={addFeatureTargetAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="key" value={row.key} />
              <input type="hidden" name="kind" value="area" />
              <select name="query" aria-label="Pilot area" className={`${fieldClass} w-auto`}>
                {data.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
              <button type="submit" className={buttonClass("white", "sm")}>Add area</button>
            </form>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function AreasCard({ data }: { data: Data }) {
  return (
    <Card id="areas" className="mb-5 scroll-mt-6 p-5">
      <CardHead title="Pilot areas" sub="A named area is a list of places, one per line: a state (“Lagos”), an area or city in a state (“Lagos > Yaba”), or state, city and area (“Lagos > Lagos > Surulere”). Shops are placed by their city and state; suppliers and others by their city." />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {data.areas.map((area) => (
          <div key={area.id} className="rounded-[18px] border border-app-line p-4">
            <form action={savePilotAreaAction} className="grid gap-3">
              <input type="hidden" name="id" value={area.id} />
              <Field label="Name" htmlFor={`area-name-${area.id}`}>
                <input id={`area-name-${area.id}`} name="name" defaultValue={area.name} maxLength={80} required className={fieldClass} />
              </Field>
              <Field label="Places" htmlFor={`area-places-${area.id}`}>
                <textarea id={`area-places-${area.id}`} name="places" defaultValue={area.places.map(formatPlaceRule).join("\n")} rows={4} className={`${fieldClass} py-2.5 font-mono text-[13.5px]`} />
              </Field>
              <div><button type="submit" className={buttonClass("ink", "sm")}>Save area</button></div>
            </form>
            <form action={deletePilotAreaAction} className="mt-2">
              <input type="hidden" name="id" value={area.id} />
              <button type="submit" className={buttonClass("danger", "sm")}>Delete area</button>
            </form>
          </div>
        ))}
        <form action={savePilotAreaAction} className="grid gap-3 rounded-[18px] border border-dashed border-app-line p-4">
          <Field label="New area name" htmlFor="area-name-new">
            <input id="area-name-new" name="name" placeholder="Yaba–Surulere pilot" maxLength={80} required className={fieldClass} />
          </Field>
          <Field label="Places" htmlFor="area-places-new" hint="One per line.">
            <textarea id="area-places-new" name="places" placeholder={"Lagos > Yaba\nLagos > Surulere"} rows={4} className={`${fieldClass} py-2.5 font-mono text-[13.5px]`} />
          </Field>
          <div><button type="submit" className={buttonClass("ink", "sm")}>Add area</button></div>
        </form>
      </div>
    </Card>
  );
}

function InvitesCard({ data }: { data: Data }) {
  const names = new Map(data.switches.map((row) => [row.key, row.name]));
  return (
    <Card id="invites" className="mb-5 scroll-mt-6 p-5">
      <CardHead title="Invite codes" sub="For pilot creators and customers: whoever redeems a code (phone app › Settings › “Have a pilot invite code?”) gets its features, as long as each feature's master switch is on for their app and it isn't killed." />
      <form action={createFeatureInviteAction} className="mt-4 grid gap-4 rounded-[18px] border border-dashed border-app-line p-4">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 text-[13.5px] font-bold">Features the code gives</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {FEATURES.map((feature) => (
              <label key={feature.key} className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" name={`feature_${feature.key}`} className={checkboxClass} /> {names.get(feature.key) ?? feature.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Code (optional)" htmlFor="invite-code" hint="Empty: we make one.">
            <input id="invite-code" name="code" maxLength={40} placeholder="PLUGYABA" className={`${fieldClass} font-mono uppercase`} />
          </Field>
          <Field label="Uses (optional)" htmlFor="invite-uses" hint="Empty: no limit.">
            <input id="invite-uses" name="maxUses" type="number" min={1} step={1} className={fieldClass} />
          </Field>
          <Field label="Works for (days, optional)" htmlFor="invite-days" hint="Empty: no expiry.">
            <input id="invite-days" name="days" type="number" min={1} step={1} className={fieldClass} />
          </Field>
          <Field label="Note (optional)" htmlFor="invite-note">
            <input id="invite-note" name="note" maxLength={200} placeholder="Yaba creators, batch 1" className={fieldClass} />
          </Field>
        </div>
        <div><button type="submit" className={buttonClass("ink", "sm")}>Make code</button></div>
      </form>

      {data.invites.length ? (
        <ListCard className="mt-4">
          {data.invites.map((invite) => {
            const expired = invite.expiresAt ? new Date(invite.expiresAt).getTime() <= Date.now() : false;
            return (
              <ListRow key={invite.id}>
                <div className="min-w-0 flex-1 basis-[260px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-[15px] font-extrabold text-plum">{invite.code}</code>
                    {invite.disabled ? <Pill tone="danger">Off</Pill> : expired ? <Pill tone="muted">Expired</Pill> : <Pill tone="success">Works</Pill>}
                  </div>
                  <div className="text-[13px] text-app-ink-soft">
                    {invite.features.map((key) => names.get(key) ?? key).join(", ")} · {invite.uses}
                    {invite.maxUses ? ` of ${invite.maxUses}` : ""} used
                    {invite.expiresAt ? ` · until ${formatDate(invite.expiresAt)}` : ""} · made {formatDate(invite.createdAt)}
                    {invite.note ? ` · “${invite.note}”` : ""}
                  </div>
                  {invite.redeemed.length ? (
                    <details className="mt-1 text-[13px]">
                      <summary className="cursor-pointer font-bold">Who redeemed it</summary>
                      <ul className="m-0 mt-1 list-none p-0">
                        {invite.redeemed.map((use) => <li key={use.userId}>{use.who} · {formatDate(use.createdAt)}</li>)}
                      </ul>
                    </details>
                  ) : null}
                </div>
                <form action={setFeatureInviteDisabledAction}>
                  <input type="hidden" name="id" value={invite.id} />
                  <input type="hidden" name="disabled" value={invite.disabled ? "false" : "true"} />
                  <button type="submit" className={buttonClass(invite.disabled ? "white" : "danger", "sm")}>{invite.disabled ? "Turn back on" : "Turn off"}</button>
                </form>
              </ListRow>
            );
          })}
        </ListCard>
      ) : null}
    </Card>
  );
}

function changeLine(row: Data["log"][number]) {
  const show = (value: unknown) => (value === null || value === undefined ? "—" : JSON.stringify(value));
  return `${show(row.before)} → ${show(row.after)}`;
}

export default async function AdminFeaturesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  if (!isFullAdmin(await adminRoleOf(user.id))) redirect("/admin/dashboard");
  const frame = adminFrame(user);
  const query = await searchParams;
  const title = "Pilot features";
  const sub = "Pilot features ship in the code but stay off until you turn them on here for the shops, apps, areas and people taking part. Apps pick up changes within a minute, with no new release.";

  let data: Data;
  try {
    data = await adminFeatureData();
  } catch (error) {
    if (!(error instanceof FeatureSwitchesNotReady)) throw error;
    return (
      <AppPage frame={frame} title={title} sub={sub}>
        <EmptyState icon="clock" title="Not set up yet">Run docs/migrations/2026-12-13-feature-switches.sql on the database, then reload. Until then every pilot feature stays off.</EmptyState>
      </AppPage>
    );
  }

  return (
    <AppPage
      frame={frame}
      title={title}
      sub={sub}
      actions={
        <form action={setKillAllAction}>
          <input type="hidden" name="killed" value={data.killAll ? "false" : "true"} />
          <button type="submit" className={buttonClass(data.killAll ? "ink" : "danger")}>{data.killAll ? "Turn pilot features back on" : "Kill all pilot features"}</button>
        </form>
      }
    >
      <Notices query={query} />
      {data.killAll ? (
        <div role="alert" className="mb-5 rounded-[22px] border border-app-danger bg-white p-4 text-[14px] font-bold text-app-danger">Every pilot feature is off for everyone (global kill switch). Each feature keeps its settings for when you turn them back on.</div>
      ) : null}

      <nav aria-label="On this page" className="mb-5 flex flex-wrap gap-2 text-[13px]">
        {data.switches.map((row) => <a key={row.key} href={`#${row.key}`} className="rounded-full border border-app-line bg-white px-3 py-1 hover:border-plum">{row.name}</a>)}
        <a href="#areas" className="rounded-full border border-app-line bg-white px-3 py-1 font-bold text-plum">Areas</a>
        <a href="#invites" className="rounded-full border border-app-line bg-white px-3 py-1 font-bold text-plum">Invite codes</a>
        <a href="#log" className="rounded-full border border-app-line bg-white px-3 py-1 font-bold text-plum">Change log</a>
      </nav>

      {data.switches.length ? data.switches.map((row) => <FeatureCard key={row.key} row={row} data={data} />) : (
        <EmptyState icon="sparkle" title="No features">Run docs/migrations/2026-12-13-feature-switches.sql: it adds the pilot features, all off.</EmptyState>
      )}

      <AreasCard data={data} />
      <InvitesCard data={data} />

      <h2 id="log" className="mb-3 mt-8 scroll-mt-6 text-[17px] font-extrabold">Change log</h2>
      {data.log.length ? (
        <ListCard>
          {data.log.map((row) => (
            <ListRow key={row.id}>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold">
                  {row.featureKey ? `${data.switches.find((s) => s.key === row.featureKey)?.name ?? row.featureKey} · ` : ""}
                  {row.action}
                </div>
                <div className="text-[13px] text-app-ink-soft">{formatDate(row.createdAt)} {new Date(row.createdAt).toISOString().slice(11, 16)} UTC · {row.actor ?? "Unknown"}</div>
                <div className="mt-1 break-all font-mono text-[12px] text-app-ink-soft">{changeLine(row)}</div>
              </div>
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <EmptyState icon="clock" title="No changes yet">Every change shows here: who, when and what.</EmptyState>
      )}
    </AppPage>
  );
}
