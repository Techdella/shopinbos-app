"use client";

import { useEffect, useState } from "react";
import { messagesApi } from "@/components/conversations/client";
import { RiderThread } from "@/components/logistics/chats/RiderThread";
import { ChatContextBar } from "@/components/messaging/ChatContextBar";
import { useT } from "@/components/i18n/I18nProvider";
import type { ShopRiderChat } from "@shared/seller-inbox";

// The shop's chat with the rider carrying one of its parcels, inside the seller's unified inbox (?r=<job id>).
// The rider answers from the Riders app (no account; their link's token). Same route as the order page and the
// phone: GET/POST /api/mobile/delivery/jobs/<id>/messages. The bar under the header is the delivery and its order.

type Header = Omit<ShopRiderChat, "last" | "unread" | "at">;

export function RiderPane({ jobId, known, onBack, onActivity }: { jobId: string; known: ShopRiderChat | null; onBack: () => void; onActivity: () => void }) {
  const t = useT("inbox");
  const url = `/api/mobile/delivery/jobs/${encodeURIComponent(jobId)}/messages`;
  const [fetched, setFetched] = useState<Header | null>(null);

  // A job that isn't in the list (an older link): its header comes with the messages.
  useEffect(() => {
    if (known) return;
    let alive = true;
    messagesApi<{ job?: Header | null }>(url)
      .then((body) => {
        if (alive) setFetched(body.data.job ?? null);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [known, url]);

  const job: Header | null = known ?? (fetched?.jobId === jobId ? fetched : null);
  const name = job?.riderName || t("uni.yourRider");
  return (
    <RiderThread
      key={jobId}
      rider={{ riderId: jobId, name, phone: job?.riderPhone ?? null, active: job?.active ?? true }}
      url={url}
      subtitle={job?.company ? t("uni.riderFor", { company: job.company }) : t("uni.riderSub")}
      link={job?.order ? { href: `/home/orders/${job.order.id}`, label: t("uni.ctx.open") } : null}
      top={<ChatContextBar order={job?.order ?? null} deliveryStatus={job?.deliveryStatus ?? null} />}
      onBack={onBack}
      onActivity={onActivity}
    />
  );
}
