"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/growth/Modal";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { PillLink } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";
import { announceMessagesChanged, messagesApi, openConversation } from "@/components/conversations/client";

// "Ask for a price" on a supplier's public page (/suppliers/<slug>): a small form (which product, how many, anything
// else) that sends the question as a chat message to the supplier, so the answer comes back in Messages. Guests sign
// in first and come back here with ?ask=price, which opens it again.

export interface AskPriceProduct {
  id: string;
  name: string;
  moq: number;
}

type Props = {
  supplierId: string;
  supplierName: string;
  products: AskPriceProduct[];
  /** Signed-in sellers send; guests go to `loginHref` first. */
  signedIn: boolean;
  loginHref: string;
  messagesHref: string;
  label: string;
  tone?: "accent" | "ink";
  size?: "md" | "sm";
  className?: string;
};

export function AskPriceButton({ supplierId, supplierName, products, signedIn, loginHref, messagesHref, label, tone = "accent", size = "md", className }: Props) {
  const t = useT("marketplace");
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ conversation: string | null } | null>(null);

  // Back from signing in (?ask=price): open straight away, once.
  useEffect(() => {
    if (!signedIn) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("ask") !== "price") return;
    setOpen(true);
    url.searchParams.delete("ask");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [signedIn]);

  const product = products.find((item) => item.id === productId) ?? null;
  const count = Number(quantity) || 0;

  function message() {
    const lines = [t("price.ask", { name: supplierName, what: product ? product.name : t("price.yourProducts") })];
    if (count > 0) lines[0] += ` ${t("price.qtyLine", { count })}`;
    lines[0] += ` ${t("price.moqLine")}`;
    if (note.trim()) lines.push(note.trim());
    return lines.join("\n\n");
  }

  async function send() {
    setError(null);
    if (product && count > 0 && count < product.moq) return setError(t("price.belowMoq", { count: product.moq }));
    setBusy(true);
    try {
      const body = await messagesApi<{ conversationId?: string }>(`/api/conversations/${encodeURIComponent(supplierId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: message(), ...(product ? { context: { kind: "product", id: product.id } } : {}) }),
      });
      announceMessagesChanged();
      setSent({ conversation: body.data?.conversationId ?? null });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setSent(null);
    setError(null);
  }

  if (!signedIn) return <PillLink href={loginHref} tone={tone} size={size} icon="send" className={className}>{label}</PillLink>;

  return (
    <>
      <PillButton tone={tone} size={size} className={className} onClick={() => setOpen(true)} data-testid="ask-price">
        <Icon name="send" size={15} /> {label}
      </PillButton>
      {open && (
        <Modal title={t("price.title", { name: supplierName })} onClose={close}>
          {sent ? (
            <div className="grid gap-4">
              <Notice tone="success">{t("price.sent", { name: supplierName })}</Notice>
              <div className="flex flex-wrap gap-2">
                <PillButton
                  tone="ink"
                  size="md"
                  onClick={() => {
                    // The Messages drawer when the page has one, else the Messages page.
                    if (!openConversation(sent.conversation ? { conversation: sent.conversation } : { with: supplierId })) window.location.href = messagesHref;
                    close();
                  }}
                >
                  <Icon name="chat" size={15} /> {t("price.openChat")}
                </PillButton>
                <PillButton tone="white" size="md" onClick={close}>{t("price.done")}</PillButton>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {error && <Notice tone="error">{error}</Notice>}
              {products.length > 0 && (
                <label className="grid gap-1.5 text-[14px] font-bold">
                  {t("price.product")}
                  <select value={productId} onChange={(event) => setProductId(event.target.value)} className="min-h-[46px] rounded-[14px] border border-app-line bg-white px-3 text-[15px] font-normal">
                    <option value="">{t("price.anyProduct")}</option>
                    {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              )}
              <label className="grid gap-1.5 text-[14px] font-bold">
                {t("price.qty")}
                <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, "").slice(0, 7))} placeholder={product ? t("price.qtyMin", { count: product.moq }) : t("price.qtyPlaceholder")} className="min-h-[46px] rounded-[14px] border border-app-line px-3 text-[15px] font-normal" />
              </label>
              <label className="grid gap-1.5 text-[14px] font-bold">
                {t("price.note")}
                <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 1000))} rows={3} placeholder={t("price.notePlaceholder")} className="rounded-[14px] border border-app-line px-3 py-2.5 text-[15px] font-normal" />
              </label>
              <div className="rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13.5px] text-app-ink-soft">
                <p className="m-0 mb-1 text-[12px] font-extrabold uppercase tracking-[0.06em]">{t("price.preview")}</p>
                <p className="m-0 whitespace-pre-line">{message()}</p>
              </div>
              <PillButton tone="orange" size="md" busy={busy} onClick={() => void send()}>
                <Icon name="send" size={15} /> {t("price.send")}
              </PillButton>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
