"use client";

import { useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { respondToReview } from "@/app/actions/reviews";
import { useToast } from "@/components/ui/Toast";

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  reviewer: { name: string; role: string };
  booking: { pickup: string; dest: string } | null;
}

export function ReviewsClient({ reviews }: { reviews: ReviewData[] }) {
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  async function handleReply(reviewId: string) {
    const text = replyText[reviewId]?.trim();
    if (!text) return;
    setReplying((p) => ({ ...p, [reviewId]: true }));
    const formData = new FormData();
    formData.set("reviewId", reviewId);
    formData.set("response", text);
    const res = await respondToReview(formData);
    setReplying((p) => ({ ...p, [reviewId]: false }));
    if (res.success) {
      toast("Reply posted", "success");
      setReplyText((p) => ({ ...p, [reviewId]: "" }));
    } else {
      toast(res.error ?? "Failed", "error");
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {reviews.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>
          No reviews yet. Reviews from sellers, suppliers, and customers appear here once deliveries are completed.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {reviews.map((r) => (
            <div key={r.id} style={{ padding: 16, borderBottom: "1px solid var(--ink-100)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.reviewer.name}</div>
                  <Badge variant="info" style={{ fontSize: 10, textTransform: "capitalize" }}>{r.reviewer.role.replace(/_/g, " ")}</Badge>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ fontSize: 14, color: s <= r.rating ? "var(--amber-500)" : "var(--ink-200)" }}>★</span>
                ))}
              </div>
              {r.comment && <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.5, marginBottom: 4 }}>{r.comment}</div>}
              {r.booking && <div style={{ fontSize: 10.5, color: "var(--ink-400)", marginBottom: 8 }}>{r.booking.pickup} → {r.booking.dest}</div>}

              {r.response ? (
                <div style={{ padding: "8px 12px", background: "var(--teal-50)", borderRadius: 8, marginTop: 8, fontSize: 12, color: "var(--teal-800)" }}>
                  <div style={{ fontWeight: 600, fontSize: 10.5, marginBottom: 2 }}>Your reply · {r.respondedAt ? new Date(r.respondedAt).toLocaleDateString() : ""}</div>
                  {r.response}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    className="inp"
                    placeholder="Write a public reply..."
                    value={replyText[r.id] ?? ""}
                    onChange={(e) => setReplyText((p) => ({ ...p, [r.id]: e.target.value }))}
                    style={{ fontSize: 12, flex: 1 }}
                  />
                  <button
                    className="dbtn dBtn-ghost"
                    onClick={() => handleReply(r.id)}
                    disabled={replying[r.id] || !replyText[r.id]?.trim()}
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    {replying[r.id] ? "..." : "Reply"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
