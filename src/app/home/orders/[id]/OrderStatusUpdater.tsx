"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, cx } from "@/components/app-ui";

const TRANSITIONS: Record<string, string[]> = {
  paid:       ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped:    ["delivered"],
  pending:    ["cancelled"],
};

const LABELS: Record<string, string> = {
  processing: "Mark as processing",
  shipped:    "Mark as shipped",
  delivered:  "Mark as delivered",
  cancelled:  "Cancel order",
};

export function OrderStatusUpdater({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = TRANSITIONS[currentStatus] ?? [];
  if (next.length === 0) return <p className="m-0 text-[13.5px] text-app-ink-soft">No further actions available.</p>;

  async function update(status: string) {
    setError(null);
    setLoading(status);
    try {
      const res = await fetch(`/api/app/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to update order");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-2">
      {next.map(status => (
        <PillButton
          key={status}
          tone={status === "cancelled" ? "white" : "ink"}
          size="md"
          onClick={() => update(status)}
          busy={loading === status}
          disabled={loading !== null}
          className={cx("w-full", status === "cancelled" && "text-app-danger hover:border-app-danger")}
        >
          {LABELS[status] ?? status}
        </PillButton>
      ))}
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
