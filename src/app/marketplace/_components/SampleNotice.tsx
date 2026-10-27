"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { notifyWhenSuppliersJoin } from "@/app/actions/sourcing";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * What a seller sees when they try to add, save or message on a sample product: suppliers are still joining,
 * and "Get notified" sets an alert for when real products are listed.
 */
export function SampleNotice({ open, onClose, productName, notified: notifiedAtStart = false }: { open: boolean; onClose: () => void; productName?: string; notified?: boolean }) {
  const t = useT("marketplace");
  const ref = useRef<HTMLDialogElement>(null);
  const [notified, setNotified] = useState(notifiedAtStart);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function notify() {
    setError(null);
    start(async () => {
      const result = await notifyWhenSuppliersJoin();
      if (result.ok) setNotified(true);
      else setError(result.error);
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="sample-notice-title"
      className="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-[22px] border border-app-line bg-white p-0 text-app-ink backdrop:bg-black/40"
    >
      <div className="p-6">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="users" size={20} /></span>
        <h2 id="sample-notice-title" className="mb-0 mt-4 text-[19px] font-extrabold tracking-[-0.3px]">{t("sample.title")}</h2>
        <p className="mb-0 mt-2 text-[14.5px] leading-[1.55] text-app-ink-soft">
          {productName ? (() => {
            const [before, after = ""] = t("sample.isSample", { name: "\u0001" }).split("\u0001");
            return <>{before}<strong className="text-app-ink">{productName}</strong>{after} </>;
          })() : `${t("sample.generic")} `}
          {t("sample.body")}
        </p>
        {notified ? (
          <p className="mb-0 mt-4 flex items-center gap-2 rounded-[14px] bg-app-success-tint px-3.5 py-3 text-[14px] font-bold text-app-success" role="status">
            <Icon name="check" size={16} /> {t("sample.willTell")}
          </p>
        ) : null}
        {error ? <p className="mb-0 mt-3 text-[13.5px] font-bold text-app-danger" role="alert">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {!notified && (
            <button type="button" onClick={notify} disabled={pending} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white hover:bg-black disabled:opacity-60">
              <Icon name="bell" size={16} /> {pending ? t("sample.saving") : t("sample.notify")}
            </button>
          )}
          <button type="button" onClick={onClose} className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-bold hover:border-app-line-strong">
            {notified ? t("sample.done") : t("sample.notNow")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
