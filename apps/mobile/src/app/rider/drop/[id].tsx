import { Redirect, useLocalSearchParams } from "expo-router";

// Old links to one drop open the Riders app on that delivery (the app is one screen at a time now).
export default function RiderDrop() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/rider", params: { drop: String(id ?? "") } }} />;
}
