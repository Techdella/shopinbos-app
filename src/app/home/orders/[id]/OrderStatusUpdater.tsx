"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";

const TRANSITIONS: Record<string, string[]> = {
  paid:       ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped:    ["delivered"],
  pending:    ["cancelled"],
};

const LABELS: Record<string, string> = {
  processing: "Mark as Processing",
  shipped:    "Mark as Shipped",
  delivered:  "Mark as Delivered",
  cancelled:  "Cancel Order",
};

export function OrderStatusUpdater({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = TRANSITIONS[currentStatus] ?? [];
  if (next.length === 0) return <p className="text-[13px] text-[var(--color-muted)]">No further actions available.</p>;

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
    <div className="flex flex-col gap-2">
      {next.map(status => (
        <Btn
          key={status}
          variant={status === "cancelled" ? "outline" : "primary"}
          size="sm"
          onClick={() => update(status)}
          disabled={loading !== null}
        >
          {loading === status ? "Updating..." : LABELS[status] ?? status}
        </Btn>
      ))}
      {error && <p className="text-[12px] text-[var(--color-coral)] mt-1">{error}</p>}
    </div>
  );
}
