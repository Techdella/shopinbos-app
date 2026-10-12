import { Redirect, useLocalSearchParams } from "expo-router";
import { parseRiderToken } from "@/lib/partner-pure";
import { saveRiderToken } from "@/lib/rider";

// shopinbos://rider/<token>: the private Riders app link opened on the phone. Keeps the token and opens the runs.
export default function RiderLinkCatch() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const parsed = parseRiderToken(String(token ?? ""));
  if (!parsed) return <Redirect href="/rider/link" />;
  saveRiderToken(parsed);
  return <Redirect href="/rider" />;
}
