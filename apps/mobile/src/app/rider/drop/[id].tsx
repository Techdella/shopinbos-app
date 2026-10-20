import { Redirect, useLocalSearchParams } from "expo-router";

// Old links to one drop open that delivery's steps in the Riders app.
export default function RiderDrop() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/rider/job", params: { id: String(id ?? "") } }} />;
}
