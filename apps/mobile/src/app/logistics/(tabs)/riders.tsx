import { Redirect } from "expo-router";

// Riders moved under Business (Business → Riders, /logistics/team). Old links to the Riders tab open that list.
export default function OldRidersTab() {
  return <Redirect href="/logistics/team" />;
}
