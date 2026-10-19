"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

const STATUS_FLOW = ["pending", "paid", "processing", "packed", "shipped", "delivered"];


const TRANSITIONS: Record<string, string[]> = {
  paid:       ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed:     ["shipped", "cancelled"],
  shipped:    ["delivered"],
  // Cash, transfer or POS received outside Paystack (e.g. a recorded sale or pay on delivery).
  pending:          ["paid", "cancelled"],
  awaiting_payment: ["paid", "cancelled"],
};

const LOGISTICS_OPTIONS = [
  { value: "personal", label: "ful.personal", desc: "ful.personalDesc" },
  { value: "pickup", label: "ful.pickup", desc: "ful.pickupDesc" },
] as const;

interface FulfillmentPanelProps {
  orderId: string;
  currentStatus: string;
  trackingCode?: string | null;
  logisticsDetails?: Record<string, unknown> | null;
}

export function FulfillmentPanel({ orderId, currentStatus, trackingCode, logisticsDetails }: FulfillmentPanelProps) {
  const t = useT("orders", "common");
  const statusLabel = (status: string) => t.dynamic(`status.${status}`, status);
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLogistics, setShowLogistics] = useState(false);
  const [logisticsType, setLogisticsType] = useState("personal");
  const [trackingInput, setTrackingInput] = useState(trackingCode ?? "");

  // "awaiting_payment" sits at the same point in the flow as "pending".
  const currentIdx = STATUS_FLOW.indexOf(currentStatus === "awaiting_payment" ? "pending" : currentStatus);
  const next = TRANSITIONS[currentStatus] ?? [];
  const isTerminal = ["delivered", "cancelled", "refunded", "returned"].includes(currentStatus);
  const offFlow = currentIdx === -1;

  async function update(status: string, extra: Record<string, unknown> = {}) {
    setError(null);
    setLoading(status);
    try {
      const res = await fetch(`/api/app/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? t("ful.updateFailed"));
      } else {
        setShowLogistics(false);
        router.refresh();
      }
    } catch {
      setError(t("noConnection"));
    } finally {
      setLoading(null);
    }
  }

  function handleStatusClick(status: string) {
    if (status === "shipped") {
      setShowLogistics(true);
      return;
    }
    update(status);
  }

  function handleShipWithLogistics() {
    const extra: Record<string, unknown> = {
      logisticsType,
      logisticsDetails: { type: logisticsType },
    };
    if (trackingInput.trim()) {
      extra.trackingCode = trackingInput.trim();
    }
    update("shipped", extra);
  }

  return (
    <div className="grid gap-4">
      {/* Where the order is in the flow */}
      {offFlow ? (
        <p className="m-0 text-[14px] font-bold">{statusLabel(currentStatus)}</p>
      ) : (
        <ol className="m-0 grid list-none gap-0 p-0" aria-label={t("ful.progress")}>
          {STATUS_FLOW.map((step, index) => {
            const done = index < currentIdx;
            const active = index === currentIdx;
            return (
              <li key={step} className="relative flex items-center gap-3 py-1.5" aria-current={active ? "step" : undefined}>
                {index < STATUS_FLOW.length - 1 && (
                  <span aria-hidden className={cx("absolute left-[7px] top-[22px] h-[calc(100%-10px)] w-[2px]", index < currentIdx ? "bg-app-ink" : "bg-app-track")} />
                )}
                <span
                  aria-hidden
                  className={cx(
                    "relative grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                    done ? "border-app-ink bg-app-ink" : active ? "border-app-accent bg-white" : "border-app-track bg-white",
                  )}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-app-accent" />}
                </span>
                <span className={cx("text-[14px]", active ? "font-extrabold" : done ? "font-semibold" : "text-app-ink-soft")}>
                  {step === "pending" && currentStatus === "awaiting_payment" ? statusLabel("awaiting_payment") : statusLabel(step)}
                </span>
                {active && <span className="ml-auto text-[12.5px] font-bold text-app-accent-ink">{t("ful.now")}</span>}
                {done && <span className="sr-only">{t("ful.done")}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {/* Shipping method */}
      {showLogistics && (
        <fieldset className="m-0 grid gap-3 rounded-[18px] border border-app-line p-4">
          <legend className="px-1 text-[15px] font-extrabold">{t("ful.howGetting")}</legend>
          <div className="grid gap-2">
            {LOGISTICS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-[14px] border p-3 transition",
                  logisticsType === opt.value ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="logistics"
                  value={opt.value}
                  checked={logisticsType === opt.value}
                  onChange={() => setLogisticsType(opt.value)}
                  className="mt-1 h-4 w-4 accent-[#16141F]"
                />
                <span>
                  <span className="block text-[14px] font-bold">{t(opt.label)}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{t(opt.desc)}</span>
                </span>
              </label>
            ))}
          </div>
          {logisticsType === "personal" && (
            <div>
              <FieldLabel htmlFor="tracking-code">{t("ful.trackingOptional")}</FieldLabel>
              <TextInput
                id="tracking-code"
                placeholder={t("ful.trackingPlaceholder")}
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                className="h-12"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <PillButton tone="accent" size="md" onClick={handleShipWithLogistics} busy={loading === "shipped"} disabled={loading !== null}>
              {t("action.markShipped")}
            </PillButton>
            <PillButton tone="white" size="md" onClick={() => setShowLogistics(false)}>{t("cancel")}</PillButton>
          </div>
        </fieldset>
      )}

      {/* Tracking */}
      {trackingCode && currentStatus === "shipped" && (
        <div className="rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[12.5px] text-app-ink-soft">{t("detail.tracking")}</div>
          <div className="break-all text-[15px] font-extrabold">{trackingCode}</div>
          {logisticsDetails && (
            <div className="mt-0.5 text-[12.5px] text-app-ink-soft">
              {logisticsDetails.type === "pickup" ? t("detail.pickup") : t("detail.personal")}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isTerminal && next.length > 0 && !showLogistics && (
        <div className="grid gap-2">
          {next.map((status) => (
            <PillButton
              key={status}
              tone={status === "cancelled" ? "white" : "accent"}
              size="md"
              onClick={() => handleStatusClick(status)}
              busy={loading === status}
              disabled={loading !== null}
              className={cx("w-full", status === "cancelled" && "text-app-danger hover:border-app-danger")}
            >
              {t.dynamic(`action.${status}`, statusLabel(status))}
            </PillButton>
          ))}
        </div>
      )}

      {error && <Notice>{error}</Notice>}

      {isTerminal && (
        <p className="m-0 text-[13.5px] text-app-ink-soft">{t("ful.complete")}</p>
      )}
    </div>
  );
}
