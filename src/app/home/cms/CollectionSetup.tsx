"use client";

import { useState } from "react";
import { Modal } from "@/components/cms/pickers";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import type { ItemLayout, ListLayout } from "@/lib/cms/layouts";
import { LayoutPicker } from "./LayoutPicker";
import { itemLayoutOptions, listLayoutOptions } from "./[collectionId]/CollectionSettings";
import { friendlyError } from "@/lib/errors/report-client";

// Shown after the first item in a collection is saved (the first blog post): name and intro, the list and page
// style, and putting it in the header or footer menu, so shoppers can find it. "Not now" also counts as done.

export type MenuState = { header: boolean; footer: boolean };
type Placement = "header" | "footer" | "both" | "none";

export function CollectionSetup(props: {
  collection: { id: string; name: string; description: string; itemLabel: string; layout: ListLayout; itemLayout: ItemLayout; isPublished: boolean };
  menu: MenuState;
  onClose: () => void;
}) {
  const t = useT("cms");
  const c = props.collection;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [layout, setLayout] = useState<ListLayout>(c.layout);
  const [itemLayout, setItemLayout] = useState<ItemLayout>(c.itemLayout);
  const [placement, setPlacement] = useState<Placement>(props.menu.header || props.menu.footer ? "none" : "header");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<MenuState | null>(null);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/app/cms/collections/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? t("cs.saveError"));
  }

  async function skip() {
    await patch({ setupDone: true }).catch(() => null);
    props.onClose();
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      await patch({ name: name.trim() || c.name, description, layout, itemLayout, isPublished: true, setupDone: true });
      let menu = props.menu;
      if (placement !== "none") {
        const res = await fetch(`/api/app/cms/collections/${c.id}/menu`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement }) });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? t("setup.menuError"));
        menu = json.data;
      }
      setDone(menu);
    } catch (e) {
      setError(e instanceof Error ? friendlyError(e) : t("cs.saveError"));
    } finally {
      setBusy(false);
    }
  }

  const steps = [t("setup.step.details"), t("setup.step.style"), t("setup.step.menu")];
  const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none focus:border-app-ink";

  if (done) {
    return (
      <Modal title={t("setup.doneTitle", { name: name.trim() || c.name })} wide onClose={props.onClose} footer={<PillButton tone="ink" size="sm" onClick={props.onClose}>{t("setup.backToPost")}</PillButton>}>
        <div className="grid gap-3 text-[14.5px]">
          <p className="m-0 flex items-center gap-2"><Icon name="check" size={16} /> {t("setup.doneStyle")}</p>
          <p className="m-0 flex items-center gap-2">
            <Icon name={done.header || done.footer ? "check" : "info"} size={16} />
            {done.header && done.footer ? t("setup.inBoth") : done.header ? t("setup.inHeader") : done.footer ? t("setup.inFooter") : t("setup.notInMenu")}
          </p>
          <a href="/home/navigation" className="text-[13.5px] font-bold text-app-ink underline">{t("setup.editMenus")}</a>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={t("setup.title", { name: c.name })}
      wide
      onClose={() => void skip()}
      footer={
        <>
          <PillButton tone="white" size="sm" disabled={busy} onClick={() => void skip()} className="mr-auto">{t("setup.notNow")}</PillButton>
          {step > 0 && <PillButton tone="white" size="sm" disabled={busy} onClick={() => setStep(step - 1)}>{t("setup.back")}</PillButton>}
          {step < 2 ? (
            <PillButton tone="ink" size="sm" disabled={!name.trim()} onClick={() => setStep(step + 1)}>{t("setup.next")}</PillButton>
          ) : (
            <PillButton tone="accent" size="sm" busy={busy} onClick={() => void finish()}>{t("setup.finish")}</PillButton>
          )}
        </>
      }
    >
      <p className="m-0 mb-4 text-[14px] text-app-ink-soft">{t("setup.intro", { label: c.itemLabel.toLowerCase() })}</p>
      <ol className="m-0 mb-5 flex list-none gap-2 p-0" aria-label={t("setup.steps")}>
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={cx("flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold", index === step ? "bg-app-ink text-white" : index < step ? "bg-app-canvas text-app-ink" : "bg-app-canvas text-app-ink-soft")}>
            <span aria-hidden>{index < step ? "✓" : index + 1}</span> {label}
          </li>
        ))}
      </ol>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}

      {step === 0 && (
        <div className="grid gap-4">
          <div>
            <label htmlFor="setup-name" className="mb-1.5 block text-[13.5px] font-bold">{t("new.name")}</label>
            <input id="setup-name" className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="setup-desc" className="mb-1.5 block text-[13.5px] font-bold">{t("cs.intro")}</label>
            <textarea id="setup-desc" rows={3} className={cx(input, "py-2.5")} value={description} maxLength={500} placeholder={t("setup.introPh")} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {!c.isPublished && <p className="m-0 text-[13px] text-app-ink-soft">{t("setup.willShow")}</p>}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-5">
          <LayoutPicker legend={t("cs.layout")} help={t("cs.layoutHelp")} value={layout} onChange={setLayout} options={listLayoutOptions(t)} />
          <LayoutPicker legend={t("cs.itemLayout", { label: c.itemLabel })} help={t("setup.itemLayoutHelp")} value={itemLayout} onChange={setItemLayout} options={itemLayoutOptions(t)} />
        </div>
      )}

      {step === 2 && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[13.5px] font-bold">{t("setup.whereMenu", { name: name.trim() || c.name })}</legend>
          {(props.menu.header || props.menu.footer) && <p className="m-0 mb-2 text-[13px] text-app-ink-soft">{props.menu.header && props.menu.footer ? t("setup.inBoth") : props.menu.header ? t("setup.inHeader") : t("setup.inFooter")}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {(["header", "footer", "both", "none"] as const).map((value) => (
              <label key={value} className={cx("flex min-h-[56px] cursor-pointer items-start gap-2.5 rounded-[14px] border p-3", placement === value ? "border-app-ink ring-1 ring-app-ink" : "border-app-line")}>
                <input type="radio" name="setup-menu" className="mt-1" checked={placement === value} onChange={() => setPlacement(value)} />
                <span>
                  <span className="block text-[14px] font-bold">{t(`setup.place.${value}`)}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{t(`setup.place.${value}Help`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </Modal>
  );
}
