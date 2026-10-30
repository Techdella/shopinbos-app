import { api, appHeaders } from "./api";
import { useFeature } from "./features";
import { PILOT_NUMBER_FEATURES, type PilotNumbers } from "@shared/pilot-numbers";

// Pilot numbers (shared/pilot-numbers.ts; web /home/pilot-numbers): the shop's numbers in the Shopinbos pilot. The
// server checks the pilot switches for this app (the app headers say which).

export type { PilotNumbers };

export function fetchPilotNumbers() {
  return api<PilotNumbers>("/api/app/pilot-numbers", { headers: appHeaders() });
}

/** Is any pilot feature (post_to_plug, resell, notify_followers, plug_follow_card) on for this account on this app? */
export function usePilotNumbersOn() {
  const plug = useFeature(PILOT_NUMBER_FEATURES[0]);
  const resell = useFeature(PILOT_NUMBER_FEATURES[1]);
  const notify = useFeature(PILOT_NUMBER_FEATURES[2]);
  const card = useFeature(PILOT_NUMBER_FEATURES[3]);
  return plug || resell || notify || card;
}
