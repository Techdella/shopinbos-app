"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { messagesApi } from "@/components/conversations/client";
import { Thread } from "@/components/conversations/Thread";
import type { ContextRef, ConversationSummary, ThreadMessage } from "@/lib/conversations/pure";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

// A chat with a supplier or delivery partner inside the seller's unified inbox: the same thread as the partner
// portals (src/components/conversations/Thread.tsx: photos and PDFs, linked products/orders/deliveries, ticks,
// voice notes written down by the mic), with the order or delivery it's about in a bar under the header.

export function PartnerPane({
  conversationId,
  known,
  filesEnabled,
  initialContext,
  onBack,
  onActivity,
}: {
  conversationId: string;
  /** The conversation from the list, when it's there (else it's fetched with the first page of messages). */
  known: ConversationSummary | null;
  filesEnabled: boolean;
  initialContext?: ContextRef | null;
  onBack: () => void;
  onActivity: () => void;
}) {
  const t = useT("inbox", "common");
  const [fetched, setFetched] = useState<ConversationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (known) return;
    let alive = true;
    setError(null);
    messagesApi<ThreadMessage[], { conversation: ConversationSummary | null }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`)
      .then((body) => {
        if (!alive) return;
        if (body.meta?.conversation) setFetched(body.meta.conversation);
        else setError(t("msgr.unavailable"));
      })
      .catch((problem: Error) => alive && setError(friendlyError(problem)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, known]);

  const summary = known ?? (fetched?.id === conversationId ? fetched : null);
  if (!summary) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center text-[14px] text-app-ink-soft">
        {error ? (
          <div>
            <p role="alert" className="m-0 font-semibold text-app-danger">{error}</p>
            <button type="button" onClick={onBack} className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold lg:hidden">
              <Icon name="arrowLeft" size={14} /> {t("thread.back")}
            </button>
          </div>
        ) : (
          <p className="m-0">{t("msgr.opening")}</p>
        )}
      </div>
    );
  }
  return <Thread key={summary.id} conversation={summary} role="seller" initialContext={initialContext ?? null} filesEnabled={filesEnabled} onBack={onBack} onActivity={onActivity} contextBar />;
}
