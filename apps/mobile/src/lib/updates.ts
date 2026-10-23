import { api } from "@/lib/api";
import type { VideoSource } from "@shared/help-videos";
import type { UpdateKind } from "@shared/weekly-updates";

// Weekly updates from the Shopinbos team (selling tips, news), made at /admin/updates on the web. The same feed and
// "seen" record as the ring in the web app's top bar (GET /api/updates, POST /api/updates/:id/view).

export interface TeamUpdate {
  id: string;
  kind: UpdateKind;
  title: string;
  body: string | null;
  theme: string;
  motion: string | null;
  imageUrl: string | null;
  video: VideoSource | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  cta: { label: string; url: string } | null;
  publishedAt: string;
  seen: boolean;
}

export const fetchTeamUpdates = () => api<TeamUpdate[]>("/api/updates").then((data) => (Array.isArray(data) ? data : [])).catch(() => [] as TeamUpdate[]);

export const markTeamUpdateSeen = (id: string) => api(`/api/updates/${encodeURIComponent(id)}/view`, { method: "POST" }).catch(() => null);
