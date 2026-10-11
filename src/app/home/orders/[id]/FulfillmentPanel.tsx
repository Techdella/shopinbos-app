"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";

const STATUS_FLOW = ["pending", "paid", "processing", "packed", "shipped", "delivered"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
};

const TRANSITIONS: Record<string, string[]> = {
  paid:       ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed:     ["shipped", "cancelled"],
  shipped:    ["delivered"],
  pending:    ["cancelled"],
};

const LOGISTICS_OPTIONS = [
  { value: "personal", label: "Personal logistics", desc: "I will handle delivery myself" },
  { value: "pickup", label: "Buyer pickup", desc: "Buyer will collect in person" },
];

interface FulfillmentPanelProps {
  orderId: string;
  currentStatus: string;
  trackingCode?: string | null;
  logisticsDetails?: Record<string, unknown> | null;
}

export function FulfillmentPanel({ orderId, currentStatus, trackingCode, logisticsDetails }: FulfillmentPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLogistics, setShowLogistics] = useState(false);
  const [logisticsType, setLogisticsType] = useState("personal");
  const [trackingInput, setTrackingInput] = useState(trackingCode ?? "");
  const [showTrackingInput, setShowTrackingInput] = useState(false);

  const currentIdx = STATUS_FLOW.indexOf(currentStatus);
  const next = TRANSITIONS[currentStatus] ?? [];
  const isTerminal = ["delivered", "cancelled", "refunded", "returned"].includes(currentStatus);

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
        setError(data.error?.message ?? "Failed to update order");
      } else {
        setShowLogistics(false);
        setShowTrackingInput(false);
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
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
    <div className="flex flex-col gap-4">
      {/* Status Timeline */}
      <div className="flex items-center gap-1">
        {STATUS_FLOW.map((s, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
              <div
                className="h-2 w-full rounded-full transition-colors"
                style={{
                  background: done ? "var(--color-teal-deep)" : "rgba(14,42,56,0.08)",
                  opacity: active ? 1 : done ? 0.7 : 0.4,
                }}
              />
              {i < STATUS_FLOW.length - 1 && (
                <div
                  className="h-[2px] flex-1 transition-colors"
                  style={{ background: done && i < currentIdx ? "var(--color-teal-deep)" : "rgba(14,42,56,0.08)" }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] font-mono tracking-[0.08em] text-[var(--color-muted)]">
        {STATUS_FLOW.map((s) => (
          <span key={s} style={{ fontWeight: currentStatus === s ? 700 : 400, color: currentStatus === s ? "var(--color-navy)" : undefined }}>
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {/* Logistics Selection Modal */}
      {showLogistics && (
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: "rgba(14,42,56,0.1)" }}>
          <div className="font-semibold text-[var(--color-navy)] mb-3">Select shipping method</div>
          <div className="flex flex-col gap-2 mb-4">
            {LOGISTICS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                style={{
                  borderColor: logisticsType === opt.value ? "var(--color-teal-deep)" : "rgba(14,42,56,0.1)",
                  background: logisticsType === opt.value ? "rgba(115,216,200,0.08)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="logistics"
                  value={opt.value}
                  checked={logisticsType === opt.value}
                  onChange={() => setLogisticsType(opt.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-[13px] text-[var(--color-navy)]">{opt.label}</div>
                  <div className="text-[11px] text-[var(--color-muted)]">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
          {logisticsType === "personal" && (
            <div className="mb-4">
              <label className="text-[11px] font-mono tracking-[0.1em] uppercase text-[var(--color-muted)] block mb-1">Tracking code (optional)</label>
              <input
                type="text"
                placeholder="e.g. NIPOST-12345"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-[13px]"
                style={{ borderColor: "rgba(14,42,56,0.15)" }}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowLogistics(false)}>Cancel</Btn>
            <Btn size="sm" onClick={handleShipWithLogistics} disabled={loading !== null}>
              {loading === "shipped" ? "Shipping..." : "Mark as Shipped"}
            </Btn>
          </div>
        </div>
      )}

      {/* Tracking Display */}
      {trackingCode && currentStatus === "shipped" && (
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: "rgba(14,42,56,0.1)" }}>
          <div className="text-[11px] font-mono tracking-[0.1em] uppercase text-[var(--color-muted)] mb-1">Tracking</div>
          <div className="font-semibold text-[var(--color-navy)]">{trackingCode}</div>
          {logisticsDetails && (
            <div className="text-[12px] text-[var(--color-muted)] mt-1">
              {logisticsDetails.type === "pickup" ? "Buyer pickup" : "Personal logistics"}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {!isTerminal && next.length > 0 && !showLogistics && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-mono tracking-[0.1em] uppercase text-[var(--color-muted)]">Actions</div>
          {next.map((status) => (
            <Btn
              key={status}
              variant={status === "cancelled" ? "outline" : status === "shipped" ? "ghost" : "primary"}
              size="sm"
              onClick={() => handleStatusClick(status)}
              disabled={loading !== null}
            >
              {loading === status ? "Updating..." : status === "shipped" ? "Ship Order" : STATUS_LABELS[status] ?? status}
            </Btn>
          ))}
          {error && <p className="text-[12px] text-[var(--color-coral)] mt-1">{error}</p>}
        </div>
      )}

      {isTerminal && (
        <div className="text-[13px] text-[var(--color-muted)]">This order is complete.</div>
      )}
    </div>
  );
}
