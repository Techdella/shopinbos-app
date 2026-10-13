import { api } from "./api";
import { initialLocale } from "./i18n";
import { helpLanguage, normaliseHelpPath, type HelpVideoRole, type VideoSource } from "@shared/help-videos";

// "Watch a 1-minute video" in Help: the video for this screen and "All videos" for the person's role, from
// GET /api/help-videos (published videos only; the option is hidden when there's none for this screen).

export interface HelpVideoItem {
  id: string;
  topic: string;
  title: string;
  language: string;
  posterUrl: string | null;
  durationSeconds: number | null;
  source: VideoSource;
}

export interface HelpVideos {
  topic: string | null;
  current: HelpVideoItem | null;
  all: HelpVideoItem[];
}

/** The person's language: the app language (apps/mobile/src/lib/i18n.tsx), which riders share. */
export function helpVideoLanguage(_path?: string) {
  return helpLanguage(initialLocale());
}

export function loadHelpVideos(path: string, role: HelpVideoRole | null): Promise<HelpVideos> {
  const params = new URLSearchParams({ path: normaliseHelpPath(path), lang: helpVideoLanguage(path) });
  if (role) params.set("role", role);
  return api<HelpVideos>(`/api/help-videos?${params.toString()}`);
}
